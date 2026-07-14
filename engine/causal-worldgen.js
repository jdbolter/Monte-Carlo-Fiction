// =========================================
// engine/causal-worldgen.js — schema-v2 structured world generation.
// =========================================

import { makeRng } from './selector.js';
import { CausalEventSelector } from './causal-selector.js';
import { assertValidCausalTheme, validateCausalWorld } from './causal-validate.js';

function walkCausalWorld(theme, seed, selectorOptions = {}) {
  const selector = new CausalEventSelector(theme, makeRng(seed), selectorOptions);
  const steps = [];
  const stepsPerWorld = theme.config.stepsPerWorld || 6;
  for (let i = 0; i < stepsPerWorld; i++) {
    const selection = selector.selectNext();
    if (!selection) break;
    steps.push(selector.resolveSelection(selection));
  }
  return { selector, steps };
}

function canonicalBranchCandidates(theme, seed) {
  const selector = new CausalEventSelector(theme, makeRng(seed), {
    policy: { mode: 'baseline' }
  });
  const candidates = [];
  const stepsPerWorld = theme.config.stepsPerWorld || 6;
  for (let i = 0; i < stepsPerWorld; i++) {
    const selection = selector.selectNext();
    if (!selection) break;
    if (selection.event.outcomes.length > 1 && selector.hasEligibleCounterfactual(selection.event)) {
      candidates.push(selection.event.id);
    }
    selector.resolveSelection(selection);
  }
  return candidates;
}

function planDivergenceEvents(theme, seed, count) {
  const candidates = canonicalBranchCandidates(theme, seed);
  if (!candidates.length || count < 1) return [];
  const rng = makeRng((seed ^ 0x9E3779B9) >>> 0);
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function generateCausalWorld(theme, seed) {
  assertValidCausalTheme(theme);
  const policy = theme.config.worldgen?.divergencePolicy || { mode: 'naturalistic' };
  const planningRng = makeRng((seed ^ 0x85EBCA6B) >>> 0);
  const plannedCount = policy.mode === 'single'
    ? 1
    : policy.mode === 'limited'
      ? (policy.minDivergences ?? 0) + Math.floor(planningRng() * ((policy.maxDivergences ?? policy.minDivergences ?? 0) - (policy.minDivergences ?? 0) + 1))
      : 0;
  const plannedDivergenceEventIds = ['single', 'limited'].includes(policy.mode)
    ? planDivergenceEvents(theme, seed, plannedCount)
    : [];
  const singleTargetEventId = policy.mode === 'single'
    ? (plannedDivergenceEventIds[0] || null)
    : null;
  const selectorOptions = policy.mode === 'single'
    ? { singleTargetEventId }
    : policy.mode === 'limited'
      ? {
          limitedTargetEventIds: plannedDivergenceEventIds,
          targetDivergences: plannedDivergenceEventIds.length
        }
      : {};
  const { selector, steps } = walkCausalWorld(theme, seed, selectorOptions);

  const last = steps.at(-1) || null;
  const terminalState = selector.finalState();
  const world = {
    schemaVersion: 2,
    stateEncoding: 'nonDefaultFacts',
    worldId: `${theme.id}-${String(seed).padStart(4, '0')}`,
    themeId: theme.id,
    seed,
    createdAt: new Date().toISOString(),
    generation: {
      selector: 'causal',
      divergencePolicy: { ...selector.policy },
      targetDivergences: selector.targetDivergences,
      divergenceCount: selector.divergenceCount,
      ...(singleTargetEventId ? { singleDivergenceEventId: singleTargetEventId } : {}),
      ...(policy.mode === 'limited' ? { plannedDivergenceEventIds } : {})
    },
    steps,
    trajectory: { ...selector.state.trajectory },
    trajectoryDescription: selector.describeTrajectory(),
    terminalProfile: last
      ? {
          milestoneId: last.milestoneId,
          outcomeId: last.chosenOutcome.id,
          label: last.label,
          date: last.occurredAt,
          timeWindowLabel: last.date
        }
      : null,
    terminalState
  };
  world.causalValidation = validateCausalWorld(theme, world);
  if (!world.causalValidation.passed) {
    throw new Error(`Generated causal world failed validation:\n- ${world.causalValidation.errors.join('\n- ')}`);
  }
  return world;
}
