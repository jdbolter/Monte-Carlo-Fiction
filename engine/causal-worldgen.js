// =========================================
// engine/causal-worldgen.js — schema-v2 structured world generation.
// =========================================

import { makeRng } from './selector.js';
import { CausalEventSelector } from './causal-selector.js';
import { assertValidCausalTheme, validateCausalWorld } from './causal-validate.js';

export function generateCausalWorld(theme, seed) {
  assertValidCausalTheme(theme);
  const selector = new CausalEventSelector(theme, makeRng(seed));
  const steps = [];
  const stepsPerWorld = theme.config.stepsPerWorld || 6;
  for (let i = 0; i < stepsPerWorld; i++) {
    const selection = selector.selectNext();
    if (!selection) break;
    steps.push(selector.resolveSelection(selection));
  }

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
      divergenceCount: selector.divergenceCount
    },
    steps,
    trajectory: { ...selector.state.trajectory },
    trajectoryDescription: selector.describeTrajectory(),
    terminalProfile: last
      ? {
          milestoneId: last.milestoneId,
          outcomeId: last.chosenOutcome.id,
          label: last.label,
          date: last.date
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
