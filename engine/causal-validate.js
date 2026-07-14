// =========================================
// engine/causal-validate.js — static theme and generated-world validation
// for schema-v2 causal themes.
// =========================================

import { isDeepStrictEqual } from 'util';
import {
  applyCausalEffects,
  createInitialCausalState,
  evaluateRequirements,
  expireEvents,
  isRegisteredFactValue,
  mergeEffects,
  parseIsoDate,
  snapshotCausalState
} from './causal-state.js';

function conditionsOf(requires) {
  return [...(requires?.all || []), ...(requires?.any || []), ...(requires?.none || [])];
}

function validateEffects(effects, owner, registry, eventIds, errors, enabledEvents) {
  for (const [fact, value] of Object.entries(effects?.sets || {})) {
    if (!registry.facts?.[fact]) errors.push(`${owner}: unknown fact "${fact}"`);
    else if (!isRegisteredFactValue(registry, fact, value)) errors.push(`${owner}: invalid value for fact "${fact}"`);
  }
  for (const [axis, delta] of Object.entries(effects?.trajectoryDelta || {})) {
    if (!registry.axes?.[axis]) errors.push(`${owner}: unknown axis "${axis}"`);
    else if (!Number.isFinite(delta) || delta < -5 || delta > 5) errors.push(`${owner}: trajectory delta for "${axis}" must be between -5 and 5`);
  }
  const enables = new Set(effects?.enables || []);
  const disables = new Set(effects?.disables || []);
  for (const eventId of enables) {
    if (!eventIds.has(eventId)) errors.push(`${owner}: enables unknown event "${eventId}"`);
    enabledEvents.add(eventId);
  }
  for (const eventId of disables) {
    if (!eventIds.has(eventId)) errors.push(`${owner}: disables unknown event "${eventId}"`);
    if (enables.has(eventId)) errors.push(`${owner}: both enables and disables "${eventId}"`);
  }
  for (const influence of effects?.influences || []) {
    if (!eventIds.has(influence.eventId)) errors.push(`${owner}: influences unknown event "${influence.eventId}"`);
    if (!(influence.weightMultiplier > 0)) errors.push(`${owner}: influence multiplier must be positive`);
  }
}

function validateRequirements(requires, owner, registry, eventIds, outcomeKeys, errors) {
  for (const condition of conditionsOf(requires)) {
    if (condition.kind === 'fact') {
      const definition = registry.facts?.[condition.fact];
      if (!definition) {
        errors.push(`${owner}: condition uses unknown fact "${condition.fact}"`);
        continue;
      }
      const equalityOperators = new Set(['equals', 'notEquals']);
      const comparisonOperators = new Set(['greaterThanOrEqual', 'lessThanOrEqual']);
      if (equalityOperators.has(condition.operator)) {
        if (!isRegisteredFactValue(registry, condition.fact, condition.value)) {
          errors.push(`${owner}: condition uses invalid value for fact "${condition.fact}"`);
        }
      } else if (condition.operator === 'in') {
        if (!Array.isArray(condition.value) || condition.value.some(value => !isRegisteredFactValue(registry, condition.fact, value))) {
          errors.push(`${owner}: condition uses invalid value list for fact "${condition.fact}"`);
        }
      } else if (comparisonOperators.has(condition.operator)) {
        if (definition.type !== 'number' || !isRegisteredFactValue(registry, condition.fact, condition.value)) {
          errors.push(`${owner}: condition uses numeric comparison with an invalid value for fact "${condition.fact}"`);
        }
      } else {
        errors.push(`${owner}: condition uses unknown operator "${condition.operator}"`);
      }
    } else if (condition.kind === 'eventOccurred') {
      if (!eventIds.has(condition.eventId)) errors.push(`${owner}: condition references unknown event "${condition.eventId}"`);
    } else if (condition.kind === 'outcomeChosen') {
      if (!outcomeKeys.has(`${condition.eventId}::${condition.outcomeId}`)) {
        errors.push(`${owner}: condition references unknown outcome "${condition.eventId}::${condition.outcomeId}"`);
      }
    } else {
      errors.push(`${owner}: unknown condition kind "${condition.kind}"`);
    }
  }
}

export function validateCausalTheme(theme) {
  const errors = [];
  const warnings = [];
  const { config, events, stateRegistry: registry } = theme;
  if (config?.schemaVersion !== 2) errors.push('Causal theme config must use schemaVersion 2');
  if (!Array.isArray(events) || !events.length) errors.push('Causal theme must define at least one event');
  if (!registry?.facts || !registry?.axes) errors.push('Causal theme must define a state registry with facts and axes');
  if (errors.length) return { passed: false, errors, warnings };
  if (config.id !== theme.id) errors.push(`Theme id "${theme.id}" does not match config id "${config.id}"`);
  if (registry.themeId !== theme.id) errors.push(`State-registry themeId "${registry.themeId}" does not match theme id "${theme.id}"`);
  if (registry.schemaVersion !== 2) errors.push('State registry must use schemaVersion 2');
  for (const fact of Object.keys(registry.facts)) {
    if (!isRegisteredFactValue(registry, fact, registry.facts[fact].default)) {
      errors.push(`State-registry fact "${fact}" has an invalid default value`);
    }
  }

  try {
    if (parseIsoDate(config.startDate) > parseIsoDate(config.endDate)) errors.push('Theme startDate must not be after endDate');
  } catch (error) {
    errors.push(error.message);
  }

  const configuredAxes = new Set(config.axes || []);
  const registryAxes = new Set(Object.keys(registry.axes));
  if (!isDeepStrictEqual(configuredAxes, registryAxes)) errors.push('Theme config axes must exactly match state-registry axes');

  const eventIds = new Set();
  for (const event of events) {
    if (eventIds.has(event.id)) errors.push(`Duplicate event id "${event.id}"`);
    eventIds.add(event.id);
  }
  if (!eventIds.has(config.startEventId)) errors.push(`Unknown startEventId "${config.startEventId}"`);
  else {
    const startEvent = events.find(event => event.id === config.startEventId);
    if (startEvent.activation !== 'default') errors.push('startEventId must reference a default-activation event');
    if (parseIsoDate(startEvent.time.earliest) > parseIsoDate(config.startDate) || parseIsoDate(startEvent.time.latest) < parseIsoDate(config.startDate)) {
      errors.push('startEventId must be eligible within its time window at startDate');
    }
  }
  const outcomeKeys = new Set();
  for (const event of events) {
    const outcomeIds = new Set();
    for (const outcome of event.outcomes || []) {
      if (outcomeIds.has(outcome.id)) errors.push(`${event.id}: duplicate outcome id "${outcome.id}"`);
      outcomeIds.add(outcome.id);
      outcomeKeys.add(`${event.id}::${outcome.id}`);
    }
  }

  const enabledEvents = new Set();
  for (const event of events) {
    if (!['default', 'explicit'].includes(event.activation)) errors.push(`${event.id}: unknown activation "${event.activation}"`);
    if (event.baseWeight !== undefined && !(event.baseWeight > 0)) errors.push(`${event.id}: baseWeight must be positive`);
    if (!event.outcomes?.length) errors.push(`${event.id}: must define at least one outcome`);
    if ((event.outcomes || []).filter(outcome => outcome.canonical).length !== 1) {
      errors.push(`${event.id}: must define exactly one canonical outcome`);
    }
    try {
      if (parseIsoDate(event.time.earliest) > parseIsoDate(event.time.latest)) errors.push(`${event.id}: earliest date is after latest date`);
      if (parseIsoDate(event.time.latest) < parseIsoDate(config.startDate) || parseIsoDate(event.time.earliest) > parseIsoDate(config.endDate)) {
        warnings.push(`${event.id}: event window lies outside the theme window`);
      }
    } catch (error) {
      errors.push(`${event.id}: ${error.message}`);
    }
    validateRequirements(event.requires, event.id, registry, eventIds, outcomeKeys, errors);
    validateEffects(event.commonEffects, `${event.id} commonEffects`, registry, eventIds, errors, enabledEvents);
    for (const outcome of event.outcomes || []) {
      if (!(outcome.weight > 0)) errors.push(`${event.id}::${outcome.id}: weight must be positive`);
      validateRequirements(outcome.requires, `${event.id}::${outcome.id}`, registry, eventIds, outcomeKeys, errors);
      validateEffects(outcome.effects, `${event.id}::${outcome.id}`, registry, eventIds, errors, enabledEvents);
      const combinedEffects = mergeEffects(event.commonEffects, outcome.effects);
      const combinedEnables = new Set(combinedEffects.enables || []);
      for (const disabledId of combinedEffects.disables || []) {
        if (combinedEnables.has(disabledId)) {
          errors.push(`${event.id}::${outcome.id}: combined common and outcome effects both enable and disable "${disabledId}"`);
        }
      }
    }
  }

  // Optimistic activation reachability: ignore requirements and assume any
  // outcome may be selected, but require an enable chain to begin at a default
  // event and reach its target before that target's window closes. This catches
  // self-enabling events and closed explicit-event cycles.
  const eventsById = new Map(events.map(event => [event.id, event]));
  const earliestReachableAt = new Map();
  for (const event of events.filter(candidate => candidate.activation === 'default')) {
    try {
      earliestReachableAt.set(event.id, parseIsoDate(event.time.earliest));
    } catch {
      // The malformed date is already reported above.
    }
  }
  let reachabilityChanged = true;
  while (reachabilityChanged) {
    reachabilityChanged = false;
    for (const event of events) {
      const sourceDate = earliestReachableAt.get(event.id);
      if (sourceDate === undefined) continue;
      for (const outcome of event.outcomes || []) {
        const effects = mergeEffects(event.commonEffects, outcome.effects);
        for (const targetId of effects.enables || []) {
          const target = eventsById.get(targetId);
          if (!target) continue;
          try {
            const targetDate = Math.max(sourceDate, parseIsoDate(target.time.earliest));
            if (targetDate <= parseIsoDate(target.time.latest) &&
                (earliestReachableAt.get(targetId) ?? Infinity) > targetDate) {
              earliestReachableAt.set(targetId, targetDate);
              reachabilityChanged = true;
            }
          } catch {
            // The malformed date is already reported above.
          }
        }
      }
    }
  }
  for (const event of events) {
    if (event.activation === 'explicit' && !earliestReachableAt.has(event.id)) {
      const reason = enabledEvents.has(event.id)
        ? 'has no time-feasible enable chain from a default event'
        : 'is never enabled';
      errors.push(`${event.id}: explicit event ${reason}`);
    }
  }

  const policy = config.worldgen?.divergencePolicy;
  const modes = new Set(['baseline', 'single', 'limited', 'naturalistic', 'all-counterfactual']);
  if (!modes.has(policy?.mode)) errors.push(`Unknown divergence policy mode "${policy?.mode}"`);
  if (policy?.mode === 'limited') {
    const min = policy.minDivergences;
    const max = policy.maxDivergences;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) {
      errors.push('Limited divergence policy requires integer 0 <= minDivergences <= maxDivergences');
    }
  }
  return { passed: errors.length === 0, errors, warnings };
}

export function assertValidCausalTheme(theme) {
  const report = validateCausalTheme(theme);
  if (!report.passed) throw new Error(`Invalid causal theme:\n- ${report.errors.join('\n- ')}`);
  return report;
}

export function validateCausalWorld(theme, world) {
  const errors = [];
  const warnings = [];
  const state = createInitialCausalState(theme.stateRegistry, theme.config.startDate);
  let divergenceCount = 0;
  let selectedBranchCount = 0;

  for (const [index, step] of world.steps.entries()) {
    const prefix = `step ${index + 1} (${step.eventId})`;
    const event = theme.events.find(candidate => candidate.id === step.eventId);
    if (!event) {
      errors.push(`${prefix}: unknown event`);
      continue;
    }
    const outcome = event.outcomes.find(candidate => candidate.id === step.chosenOutcome?.id);
    if (!outcome) {
      errors.push(`${prefix}: unknown outcome "${step.chosenOutcome?.id}"`);
      continue;
    }
    if (step.chosenOutcome.canonical !== outcome.canonical) errors.push(`${prefix}: chosenOutcome canonical flag is incorrect`);
    try {
      const occurredAt = parseIsoDate(step.occurredAt);
      if (occurredAt < parseIsoDate(state.currentDate)) errors.push(`${prefix}: chronology moved backwards`);
      if (occurredAt < parseIsoDate(event.time.earliest) || occurredAt > parseIsoDate(event.time.latest)) {
        errors.push(`${prefix}: occurrence is outside its event window`);
      }
    } catch (error) {
      errors.push(`${prefix}: ${error.message}`);
      continue;
    }

    expireEvents(state, theme.events, step.occurredAt);
    state.currentDate = step.occurredAt;
    if (state.occurred.has(event.id)) errors.push(`${prefix}: event occurred more than once`);
    if (state.disabled.has(event.id)) errors.push(`${prefix}: disabled event occurred`);
    if (event.activation === 'explicit' && !state.enabled.has(event.id)) errors.push(`${prefix}: explicit event was not enabled`);
    if (!evaluateRequirements(event.requires, state)) errors.push(`${prefix}: event requirements were not satisfied`);
    if (!evaluateRequirements(outcome.requires, state)) errors.push(`${prefix}: outcome requirements were not satisfied`);
    if (!isDeepStrictEqual(snapshotCausalState(state, theme.stateRegistry), step.stateBefore)) {
      errors.push(`${prefix}: stateBefore does not match reconstructed state`);
    }

    const effects = mergeEffects(event.commonEffects, outcome.effects);
    if (!isDeepStrictEqual(effects, step.appliedEffects)) errors.push(`${prefix}: appliedEffects do not match event + outcome effects`);
    state.occurred.add(event.id);
    state.outcomes.set(event.id, outcome.id);
    state.enabled.delete(event.id);
    state.enabledBy.delete(event.id);
    applyCausalEffects(state, effects, { eventId: event.id, outcomeId: outcome.id });
    if (!isDeepStrictEqual(snapshotCausalState(state, theme.stateRegistry), step.stateAfter)) {
      errors.push(`${prefix}: stateAfter does not match reconstructed state`);
    }
    if (event.outcomes.length > 1) {
      selectedBranchCount++;
      if (!outcome.canonical) divergenceCount++;
    }
  }

  const finalState = {
    ...snapshotCausalState(state, theme.stateRegistry),
    expiredUnselectedEvents: [...state.expired].sort()
  };
  if (!isDeepStrictEqual(world.trajectory, state.trajectory)) errors.push('World trajectory does not match reconstructed trajectory');
  if (!isDeepStrictEqual(world.terminalState, finalState)) errors.push('World terminalState does not match reconstructed state');
  if (world.generation?.divergenceCount !== divergenceCount) errors.push('Recorded divergence count is incorrect');

  const policy = theme.config.worldgen.divergencePolicy;
  if (policy.mode === 'baseline' && divergenceCount !== 0) errors.push('Baseline policy produced a counterfactual outcome');
  if (policy.mode === 'single' && selectedBranchCount > 0 && divergenceCount !== 1) errors.push('Single policy must produce exactly one divergence when a branch is visited');
  if (policy.mode === 'limited') {
    if (divergenceCount > policy.maxDivergences) errors.push('Limited policy exceeded maxDivergences');
    if (selectedBranchCount >= policy.minDivergences && divergenceCount < policy.minDivergences) errors.push('Limited policy did not reach minDivergences');
  }
  if (policy.mode === 'all-counterfactual' && divergenceCount !== selectedBranchCount) {
    errors.push('All-counterfactual policy selected a canonical branch outcome');
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    checks: {
      timeWindowsValid: !errors.some(error => error.includes('event window') || error.includes('chronology')),
      requirementsSatisfiedAtSelection: !errors.some(error => error.includes('requirements')),
      noDisabledEventOccurred: !errors.some(error => error.includes('disabled event')),
      explicitEventsWereEnabled: !errors.some(error => error.includes('explicit event')),
      divergencePolicySatisfied: !errors.some(error => error.includes('policy')),
      trajectorySumMatches: !errors.some(error => error.includes('trajectory'))
    }
  };
}
