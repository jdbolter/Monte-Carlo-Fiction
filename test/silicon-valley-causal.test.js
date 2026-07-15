import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateWorld } from '../engine/worldgen.js';
import { validateCausalTheme, validateCausalWorld } from '../engine/causal-validate.js';
import { listThemeIds, loadTheme } from '../engine/theme-loader.js';
import { diversityReport } from '../engine/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
}

function themeWithPolicy(mode, overrides = {}) {
  const theme = structuredClone(loadTheme('silicon-valley-causal'));
  theme.config.worldgen.divergencePolicy = { mode, ...overrides };
  return theme;
}

test('Silicon Valley causal theme is discovered and passes static validation', () => {
  assert.ok(listThemeIds().includes('silicon-valley-causal'));
  const theme = loadTheme('silicon-valley-causal');
  assert.equal(theme.schemaVersion, 2);
  assert.equal(theme.events.length, 37);
  assert.equal(Object.keys(theme.stateRegistry.facts).length, 24);
  assert.equal(theme.events.filter(event => event.activation === 'explicit').length, 9);
  assert.deepEqual(validateCausalTheme(theme), { passed: true, errors: [], warnings: [] });
});

test('causal conversion preserves every legacy Silicon Valley milestone and alternative', () => {
  const legacy = readJson('themes/silicon-valley/milestones.json').milestones;
  const theme = loadTheme('silicon-valley-causal');
  const events = new Map(theme.events.map(event => [event.id, event]));

  assert.equal(legacy.length, 28);
  for (const milestone of legacy) {
    const event = events.get(milestone.id);
    assert.ok(event, `missing legacy milestone ${milestone.id}`);
    assert.equal(event.label, milestone.label);
    assert.equal(event.description, milestone.description);
    assert.equal(event.category, milestone.category);
    assert.equal(event.time.display, milestone.date);

    const canonical = event.outcomes.find(outcome => outcome.canonical);
    for (const [axis, delta] of Object.entries(milestone.trajectory_contribution)) {
      assert.equal(canonical.effects.trajectoryDelta[axis] || 0, delta, `${milestone.id} changed legacy ${axis}`);
    }

    for (const alternative of milestone.branch_alternatives || []) {
      const outcome = event.outcomes.find(candidate => candidate.id === alternative.id);
      assert.ok(outcome, `missing legacy alternative ${milestone.id}::${alternative.id}`);
      assert.equal(outcome.description, alternative.description);
      assert.equal(outcome.confidence, alternative.plausibility);
      assert.equal(outcome.requirement, alternative.requirement);
      assert.deepEqual(outcome.narrativeConsequences, alternative.downstream_effects);
    }
  }
});

test('default Silicon Valley causal batch is replay-valid and broadly covers the pool', () => {
  const theme = loadTheme('silicon-valley-causal');
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
  const theme = loadTheme('silicon-valley-causal');
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
