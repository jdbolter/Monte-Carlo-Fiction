// =========================================
// engine/causal-selector.js — schema-v2 causal event selector.
//
// Unlike the legacy selector, outcomes mutate typed facts and determine which
// later events are eligible. The seeded RNG is still injected, so a v2 theme
// and seed reproduce the same world.
// =========================================

import {
  applyCausalEffects,
  createInitialCausalState,
  evaluateRequirements,
  expireEvents,
  mergeEffects,
  parseIsoDate,
  snapshotCausalState
} from './causal-state.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIME_DECAY_WEIGHT = 6;
const DEFAULT_RANK_WEIGHT_EXPONENT = 2;

function weightedPick(items, weights, rng) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return items[0];
  let draw = rng() * total;
  for (let i = 0; i < items.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return items[i];
  }
  return items[items.length - 1];
}

export class CausalEventSelector {
  constructor(theme, rng, options = {}) {
    this.theme = theme;
    this.config = theme.config;
    this.events = theme.events;
    this.registry = theme.stateRegistry;
    this.rng = rng;
    this.state = createInitialCausalState(this.registry, this.config.startDate);
    this.divergenceCount = 0;
    this.selectionCount = 0;

    const policy = options.policy || this.config.worldgen?.divergencePolicy || { mode: 'naturalistic' };
    this.policy = policy;
    this.singleTargetEventId = options.singleTargetEventId || null;
    this.limitedTargetEventIds = options.limitedTargetEventIds
      ? new Set(options.limitedTargetEventIds)
      : null;
    if (policy.mode === 'single') {
      this.targetDivergences = 1;
    } else if (policy.mode === 'limited') {
      const min = policy.minDivergences ?? 0;
      const max = policy.maxDivergences ?? min;
      this.targetDivergences = options.targetDivergences ??
        (min + Math.floor(this.rng() * (max - min + 1)));
    } else {
      this.targetDivergences = null;
    }

    const start = parseIsoDate(this.config.startDate);
    const end = parseIsoDate(this.config.endDate);
    const steps = Math.max(1, (this.config.stepsPerWorld || 6) - 1);
    this.expectedDaysPerStep = Math.max(1, (end - start) / DAY_MS / steps);
  }

  _eventById(id) {
    return this.events.find(event => event.id === id);
  }

  _isEligible(event) {
    if (this.state.occurred.has(event.id) || this.state.expired.has(event.id)) return false;
    if (this.state.disabled.has(event.id)) return false;
    if (event.activation === 'explicit' && !this.state.enabled.has(event.id)) return false;
    if (parseIsoDate(event.time.latest) < parseIsoDate(this.state.currentDate)) return false;
    return evaluateRequirements(event.requires, this.state);
  }

  _eligibleOutcomes(event) {
    return event.outcomes.filter(outcome => evaluateRequirements(outcome.requires, this.state));
  }

  hasEligibleCounterfactual(event) {
    return this._eligibleOutcomes(event).some(outcome => !outcome.canonical);
  }

  _expectedEventVector(event) {
    const outcomes = this._eligibleOutcomes(event);
    const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0) || 1;
    const vector = { ...(event.commonEffects?.trajectoryDelta || {}) };
    for (const outcome of outcomes) {
      for (const [axis, delta] of Object.entries(outcome.effects?.trajectoryDelta || {})) {
        vector[axis] = (vector[axis] || 0) + delta * outcome.weight / totalWeight;
      }
    }
    return vector;
  }

  _score(event, occurredAt) {
    const vector = this._expectedEventVector(event);
    let dot = 0;
    for (const axis of Object.keys(this.registry.axes)) {
      dot += (this.state.trajectory[axis] || 0) * (vector[axis] || 0);
    }
    const gapDays = Math.max(0, (parseIsoDate(occurredAt) - parseIsoDate(this.state.currentDate)) / DAY_MS);
    const excessSteps = Math.max(0, gapDays / this.expectedDaysPerStep - 1);
    const timeWeight = this.config.worldgen?.timeDecayWeight ?? DEFAULT_TIME_DECAY_WEIGHT;
    const branchBonus = event.outcomes.length > 1
      ? (this.config.worldgen?.branchPointBonus ?? 1)
      : 0;
    // Trajectory is cumulative, so its raw dot product grows automatically
    // with every selected event and can eventually overpower any fixed time
    // penalty. Normalize by path length to preserve thematic momentum without
    // making a century-scale jump more attractive merely because the world is
    // several steps old.
    const normalizedAlignment = dot / Math.max(1, this.selectionCount);
    return normalizedAlignment + branchBonus - timeWeight * excessSteps;
  }

  selectNext() {
    expireEvents(this.state, this.events, this.state.currentDate);
    const currentTime = parseIsoDate(this.state.currentDate);
    if (this.selectionCount === 0 && this.config.startEventId) {
      const event = this._eventById(this.config.startEventId);
      if (!event || !this._isEligible(event)) {
        throw new Error(`Configured startEventId "${this.config.startEventId}" is not eligible at ${this.state.currentDate}`);
      }
      const occurredAt = parseIsoDate(event.time.earliest) > currentTime
        ? event.time.earliest
        : this.state.currentDate;
      return { event, occurredAt, score: this._score(event, occurredAt) };
    }
    const candidates = this.events
      .filter(event => this._isEligible(event))
      .map(event => {
        const occurredAt = parseIsoDate(event.time.earliest) > currentTime
          ? event.time.earliest
          : this.state.currentDate;
        return { event, occurredAt, score: this._score(event, occurredAt) };
      })
      .sort((a, b) => b.score - a.score || a.occurredAt.localeCompare(b.occurredAt) || a.event.id.localeCompare(b.event.id));

    if (!candidates.length) return null;
    const topN = Math.min(this.config.worldgen?.topN ?? 3, candidates.length);
    const shortlist = candidates.slice(0, topN);
    const rankExponent = this.config.worldgen?.rankWeightExponent ?? DEFAULT_RANK_WEIGHT_EXPONENT;
    const weights = shortlist.map((candidate, index) => {
      const rankWeight = Math.pow(shortlist.length - index, rankExponent);
      const eventWeight = candidate.event.baseWeight ?? 1;
      const influence = this.state.influences.get(candidate.event.id) ?? 1;
      return rankWeight * eventWeight * influence;
    });
    return weightedPick(shortlist, weights, this.rng);
  }

  _chooseOutcome(event) {
    const eligible = this._eligibleOutcomes(event);
    if (!eligible.length) throw new Error(`No eligible outcomes for causal event "${event.id}"`);
    if (event.outcomes.length === 1) return eligible[0];

    const canonical = eligible.filter(outcome => outcome.canonical);
    const alternatives = eligible.filter(outcome => !outcome.canonical);
    let pool;
    switch (this.policy.mode) {
      case 'baseline':
        pool = canonical;
        break;
      case 'single':
        if (this.singleTargetEventId) {
          pool = event.id === this.singleTargetEventId && alternatives.length ? alternatives : canonical;
        } else {
          pool = this.divergenceCount < 1 && alternatives.length ? alternatives : canonical;
        }
        break;
      case 'limited':
        if (this.limitedTargetEventIds) {
          pool = this.limitedTargetEventIds.has(event.id) && alternatives.length ? alternatives : canonical;
        } else {
          pool = this.divergenceCount < this.targetDivergences && alternatives.length ? alternatives : canonical;
        }
        break;
      case 'all-counterfactual':
        pool = alternatives.length ? alternatives : canonical;
        break;
      case 'naturalistic':
      default:
        pool = eligible;
        break;
    }
    if (!pool.length) pool = eligible;
    return weightedPick(pool, pool.map(outcome => outcome.weight), this.rng);
  }

  resolveSelection(selection) {
    const { event, occurredAt } = selection;
    const expiredSincePreviousStep = expireEvents(this.state, this.events, occurredAt);
    this.state.currentDate = occurredAt;
    const stateBefore = snapshotCausalState(this.state, this.registry);
    const enabledBy = this.state.enabledBy.get(event.id) || null;
    const outcome = this._chooseOutcome(event);
    const appliedEffects = mergeEffects(event.commonEffects, outcome.effects);

    this.state.occurred.add(event.id);
    this.state.outcomes.set(event.id, outcome.id);
    this.state.enabled.delete(event.id);
    this.state.enabledBy.delete(event.id);
    applyCausalEffects(this.state, appliedEffects, { eventId: event.id, outcomeId: outcome.id });

    const isBranchPoint = event.outcomes.length > 1;
    if (isBranchPoint && !outcome.canonical) this.divergenceCount++;
    const stateAfter = snapshotCausalState(this.state, this.registry);
    this.selectionCount++;
    const chosenAlternative = isBranchPoint && !outcome.canonical
      ? {
          id: outcome.id,
          description: outcome.description,
          plausibility: outcome.confidence,
          requirement: outcome.requirement,
          downstreamEffects: outcome.narrativeConsequences || []
        }
      : null;

    return {
      eventId: event.id,
      milestoneId: event.id,
      occurredAt,
      date: event.time.display,
      timeWindow: { ...event.time },
      label: event.label,
      category: event.category || null,
      lineage: event.lineage || null,
      description: event.description,
      isBranchPoint,
      chosenOutcome: {
        id: outcome.id,
        label: outcome.label,
        canonical: outcome.canonical,
        description: outcome.description,
        requirement: outcome.requirement,
        confidence: outcome.confidence,
        evidenceType: outcome.evidenceType,
        rationale: outcome.rationale,
        narrativeConsequences: outcome.narrativeConsequences || []
      },
      chosenAlternative,
      eligibilityTrace: {
        activation: event.activation,
        withinTimeWindow: true,
        requirementsSatisfied: true,
        enabledBy,
        ...(expiredSincePreviousStep.length ? { expiredSincePreviousStep } : {})
      },
      stateBefore,
      appliedEffects,
      stateAfter
    };
  }

  finalState() {
    return {
      ...snapshotCausalState(this.state, this.registry),
      expiredUnselectedEvents: [...this.state.expired].sort()
    };
  }

  describeTrajectory() {
    const tags = [];
    for (const axis of Object.keys(this.registry.axes)) {
      const value = this.state.trajectory[axis];
      const label = axis.replaceAll('_', ' ');
      if (value > 1) tags.push(`high ${label}`);
      if (value < -1) tags.push(`low ${label}`);
    }
    return tags.length ? tags.join(', ') : 'undetermined';
  }
}
