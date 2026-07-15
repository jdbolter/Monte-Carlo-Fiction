import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../engine/worldgen.js';
import { validateCausalTheme, validateCausalWorld } from '../engine/causal-validate.js';
import { listThemeIds, loadTheme } from '../engine/theme-loader.js';
import { diversityReport } from '../engine/validate.js';

function themeWithPolicy(mode, overrides = {}) {
  const theme = structuredClone(loadTheme('silicon-valley'));
  theme.config.worldgen.divergencePolicy = { mode, ...overrides };
  return theme;
}

test('Silicon Valley causal theme is discovered and passes static validation', () => {
  assert.ok(listThemeIds().includes('silicon-valley'));
  const theme = loadTheme('silicon-valley');
  assert.equal(theme.schemaVersion, 2);
  assert.equal(theme.config.name, 'Silicon Valley');
  assert.equal(theme.events.length, 37);
  assert.equal(Object.keys(theme.stateRegistry.facts).length, 24);
  assert.equal(theme.events.filter(event => event.activation === 'explicit').length, 9);
  assert.deepEqual(validateCausalTheme(theme), { passed: true, errors: [], warnings: [] });
});

test('Silicon Valley contains the complete converted event and outcome set with archival provenance', () => {
  const theme = loadTheme('silicon-valley');
  const convertedEvents = theme.events.filter(event =>
    event.sourceRefs?.some(ref => ref.startsWith('git:98beccd:themes/silicon-valley/milestones.json#'))
  );
  const counterfactualOutcomes = theme.events.flatMap(event => event.outcomes.filter(outcome => !outcome.canonical));

  assert.equal(convertedEvents.length, 37);
  assert.equal(counterfactualOutcomes.length, 24);
  assert.ok(theme.events.some(event => event.id === 'deforest-vacuum-tube-1913'));
  assert.ok(theme.events.some(event => event.id === 'genai-boom-2022-2024'));
  assert.ok(counterfactualOutcomes.some(outcome => outcome.id === 'terman-stays-east-coast'));
  assert.ok(counterfactualOutcomes.some(outcome => outcome.id === 'ai-boom-decentralizes-geography'));
});

test('default Silicon Valley causal batch is replay-valid and broadly covers the pool', () => {
  const theme = loadTheme('silicon-valley');
  const worlds = Array.from({ length: 300 }, (_, index) => generateWorld(theme, index + 1));
  const report = diversityReport(worlds, theme.config.axes, theme);
  const sampledOutcomes = new Set(worlds.flatMap(world => world.steps.map(step => step.chosenOutcome.id)));
  const counterfactualOutcomes = theme.events.flatMap(event => event.outcomes.filter(outcome => !outcome.canonical));

  assert.ok(worlds.every(world => validateCausalWorld(theme, world).passed));
  assert.ok(worlds.every(world => world.generation.divergenceCount >= 1 && world.generation.divergenceCount <= 3));
  assert.equal(report.uniqueMilestoneChains, 300);
  assert.equal(report.uniqueOutcomePaths, 300);
  assert.equal(report.milestoneCoverage.total, 37);
  assert.equal(report.milestoneCoverage.sampled, 37);
  assert.ok(counterfactualOutcomes.every(outcome => sampledOutcomes.has(outcome.id)));
  assert.ok(report.finalMilestoneDistribution.length >= 10);
});

test('Silicon Valley causal data works under every divergence policy', () => {
  let naturalisticCanonical = 0;
  let naturalisticCounterfactual = 0;

  for (const mode of ['baseline', 'single', 'limited', 'naturalistic', 'all-counterfactual']) {
    const theme = themeWithPolicy(mode, mode === 'limited' ? { minDivergences: 1, maxDivergences: 3 } : {});
    for (let seed = 1; seed <= 75; seed++) {
      const world = generateWorld(theme, seed);
      const branches = world.steps.filter(step => step.isBranchPoint);
      assert.ok(branches.length > 0);
      assert.equal(validateCausalWorld(theme, world).passed, true);

      if (mode === 'baseline') assert.ok(branches.every(step => step.chosenOutcome.canonical));
      if (mode === 'single') assert.equal(world.generation.divergenceCount, 1);
      if (mode === 'limited') assert.ok(world.generation.divergenceCount >= 1 && world.generation.divergenceCount <= 3);
      if (mode === 'all-counterfactual') assert.ok(branches.every(step => !step.chosenOutcome.canonical));
      if (mode === 'naturalistic') {
        naturalisticCanonical += branches.filter(step => step.chosenOutcome.canonical).length;
        naturalisticCounterfactual += branches.filter(step => !step.chosenOutcome.canonical).length;
      }
    }
  }

  assert.ok(naturalisticCanonical > 0);
  assert.ok(naturalisticCounterfactual > 0);
});

test('each explicit Silicon Valley consequence is sampled only after its enabling cause', () => {
  const theme = loadTheme('silicon-valley');
  const explicitEvents = theme.events.filter(event => event.activation === 'explicit');
  const witnessed = new Set();

  for (let seed = 1; seed <= 300; seed++) {
    const world = generateWorld(theme, seed);
    for (const [index, step] of world.steps.entries()) {
      const event = explicitEvents.find(candidate => candidate.id === step.eventId);
      if (!event) continue;
      witnessed.add(event.id);
      const enabledBy = step.eligibilityTrace.enabledBy;
      assert.ok(enabledBy, `${event.id} did not record its enabling outcome`);
      assert.ok(world.steps.slice(0, index).some(previous =>
        previous.eventId === enabledBy.eventId &&
        previous.chosenOutcome.id === enabledBy.outcomeId
      ));
    }
  }

  assert.deepEqual([...witnessed].sort(), explicitEvents.map(event => event.id).sort());
});
