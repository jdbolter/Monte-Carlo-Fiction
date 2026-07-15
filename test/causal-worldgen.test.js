import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { generateWorld } from '../engine/worldgen.js';
import { validateCausalTheme, validateCausalWorld } from '../engine/causal-validate.js';
import { listThemeIds, loadTheme, loadThemeDirectory } from '../engine/theme-loader.js';
import { buildRenderPrompt } from '../engine/render-verbal.js';
import { buildScenePrompt } from '../engine/render-visual.js';
import { diversityReport } from '../engine/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'themes', 'vr-immersion-causal-pilot');

function readJson(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

function pilotTheme(mode = 'limited', policyOverrides = {}) {
  const config = readJson('theme.config.json');
  config.worldgen.divergencePolicy = {
    ...config.worldgen.divergencePolicy,
    mode,
    ...policyOverrides
  };
  return {
    id: config.id,
    schemaVersion: 2,
    config,
    events: readJson('events.json').events,
    stateRegistry: readJson('state-registry.json'),
    framework: null
  };
}

test('causal design fixture passes static validation', () => {
  assert.deepEqual(validateCausalTheme(pilotTheme()).errors, []);
});

test('theme loader reads a schema-v2 theme directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'monte-carlo-fiction-v2-'));
  try {
    copyFileSync(join(FIXTURE_DIR, 'theme.config.json'), join(dir, 'theme.config.json'));
    copyFileSync(join(FIXTURE_DIR, 'events.json'), join(dir, 'events.json'));
    copyFileSync(join(FIXTURE_DIR, 'state-registry.json'), join(dir, 'state-registry.json'));
    const theme = loadThemeDirectory('vr-immersion-causal-pilot', dir);
    assert.equal(theme.schemaVersion, 2);
    assert.equal(theme.events.length, 17);
    assert.equal(Object.keys(theme.stateRegistry.facts).length, 23);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('active causal pilot is auto-discovered as a schema-v2 theme', () => {
  assert.ok(listThemeIds().includes('vr-immersion-causal-pilot'));
  const theme = loadTheme('vr-immersion-causal-pilot');
  assert.equal(theme.schemaVersion, 2);
  assert.equal(theme.events.length, 17);
});

test('schema-version dispatch generates a replay-valid causal world', () => {
  const theme = pilotTheme();
  const world = generateWorld(theme, 42);
  assert.equal(world.schemaVersion, 2);
  assert.equal(world.generation.selector, 'causal');
  assert.equal(world.causalValidation.passed, true);
  assert.equal(validateCausalWorld(theme, world).passed, true);
});

test('both render prompts receive explicit canonical v2 outcomes', () => {
  const theme = pilotTheme('baseline');
  const world = generateWorld(theme, 1);
  const canonicalBranch = world.steps.find(step => step.isBranchPoint);
  const verbalPrompt = buildRenderPrompt(theme, world);
  assert.ok(canonicalBranch.chosenOutcome.canonical);
  assert.match(verbalPrompt.userPrompt, /Outcome in this world \(canonical control\)/);
  assert.match(verbalPrompt.userPrompt, /event window:/);
  assert.match(verbalPrompt.userPrompt, new RegExp(canonicalBranch.chosenOutcome.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(verbalPrompt.systemPrompt, /one or two complete, plain-language sentences/);
  assert.match(verbalPrompt.systemPrompt, /what it physically or operationally was/);
  assert.match(verbalPrompt.systemPrompt, /do not invent a mechanism, sensory effect, performance claim, or other capability/);
  assert.match(verbalPrompt.userPrompt, /do not add unsupported capabilities/);
  assert.match(buildScenePrompt(theme, world).userPrompt, /Outcome in this world \(canonical control\)/);
});

test('baseline policy chooses only canonical branch outcomes', () => {
  const theme = pilotTheme('baseline');
  for (let seed = 1; seed <= 25; seed++) {
    const world = generateWorld(theme, seed);
    const branches = world.steps.filter(step => step.isBranchPoint);
    assert.ok(branches.length > 0);
    assert.equal(world.steps[0].eventId, 'holmes-stereoscope-1861');
    assert.ok(branches.every(step => step.chosenOutcome.canonical));
    assert.equal(world.generation.divergenceCount, 0);
  }
});

test('single policy chooses exactly one counterfactual branch outcome', () => {
  const divergenceEvents = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const theme = pilotTheme('single');
    const world = generateWorld(theme, seed);
    const baseline = generateWorld(pilotTheme('baseline'), seed);
    const targetId = world.generation.singleDivergenceEventId;
    const targetIndex = world.steps.findIndex(step => step.eventId === targetId);
    assert.equal(world.generation.divergenceCount, 1);
    assert.ok(targetIndex >= 0);
    divergenceEvents.add(targetId);
    assert.deepEqual(
      world.steps.slice(0, targetIndex + 1).map(step => step.eventId),
      baseline.steps.slice(0, targetIndex + 1).map(step => step.eventId)
    );
    assert.equal(validateCausalWorld(theme, world).passed, true);
  }
  assert.ok(divergenceEvents.size >= 3);
});

test('limited policy obeys its divergence bounds across a batch', () => {
  const theme = pilotTheme('limited', { minDivergences: 1, maxDivergences: 3 });
  const firstDivergenceDates = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const world = generateWorld(theme, seed);
    assert.ok(world.generation.divergenceCount >= 1);
    assert.ok(world.generation.divergenceCount <= 3);
    assert.ok(world.generation.plannedDivergenceEventIds.length >= 1);
    const firstDivergence = world.steps.find(step => step.isBranchPoint && !step.chosenOutcome.canonical);
    firstDivergenceDates.add(firstDivergence.occurredAt);
    assert.equal(validateCausalWorld(theme, world).passed, true);
  }
  assert.ok(firstDivergenceDates.size >= 5);
});

test('all-counterfactual policy never chooses canonical at a visited branch', () => {
  const theme = pilotTheme('all-counterfactual');
  for (let seed = 1; seed <= 50; seed++) {
    const world = generateWorld(theme, seed);
    const branches = world.steps.filter(step => step.isBranchPoint);
    assert.ok(branches.length > 0);
    assert.ok(branches.every(step => !step.chosenOutcome.canonical));

    const ids = new Set(world.steps.map(step => step.eventId));
    if (ids.has('kinetoscope-parlor-system-1896')) assert.ok(!ids.has('movie-palace-system-1905'));
    const acquisition = world.steps.find(step => step.eventId === 'facebook-acquires-oculus-2014');
    if (acquisition?.chosenOutcome.id === 'gaming-hardware-acquirer') assert.ok(!ids.has('facebook-rebrands-meta-2021'));
  }
});

test('naturalistic policy samples both canonical and counterfactual outcomes', () => {
  const theme = pilotTheme('naturalistic');
  let canonicalBranches = 0;
  let counterfactualBranches = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const world = generateWorld(theme, seed);
    for (const step of world.steps.filter(candidate => candidate.isBranchPoint)) {
      if (step.chosenOutcome.canonical) canonicalBranches++;
      else counterfactualBranches++;
    }
    assert.equal(validateCausalWorld(theme, world).passed, true);
  }
  assert.ok(canonicalBranches > 0);
  assert.ok(counterfactualBranches > 0);
});

test('causal batch diagnostics report path, milestone, and state diversity', () => {
  const theme = pilotTheme('limited', { minDivergences: 1, maxDivergences: 3 });
  const worlds = Array.from({ length: 100 }, (_, index) => generateWorld(theme, index + 1));
  const report = diversityReport(worlds, theme.config.axes, theme);
  assert.ok(report.uniqueOutcomePaths >= report.uniqueMilestoneChains);
  assert.deepEqual(report.milestoneCoverage, {
    sampled: 17,
    total: 17,
    ratio: 1,
    unsampledMilestoneIds: []
  });
  assert.ok(report.mostCommonFinalMilestone.count > 0);
  assert.equal(
    report.finalMilestoneDistribution.reduce((sum, milestone) => sum + milestone.count, 0),
    100
  );
  assert.equal('uniqueTerminals' in report, false);
  assert.equal('repeatedEndingRate' in report, false);
  assert.ok(report.causalDiagnostics.uniqueTerminalStates > 1);
  assert.deepEqual(Object.keys(report.causalDiagnostics.divergenceCountDistribution), ['1', '2', '3']);
  assert.ok(Object.values(report.causalDiagnostics.divergenceCountDistribution).every(count => count > 0));
  assert.equal(
    Object.values(report.causalDiagnostics.divergenceCountDistribution).reduce((sum, count) => sum + count, 0),
    100
  );
});

test('two events in the same year can both occur', () => {
  const theme = {
    id: 'same-year-test',
    config: {
      schemaVersion: 2,
      id: 'same-year-test',
      startDate: '1951-01-01',
      endDate: '1951-12-31',
      startEventId: 'first-1951',
      stepsPerWorld: 2,
      axes: ['axis'],
      worldgen: { topN: 1, divergencePolicy: { mode: 'baseline' } }
    },
    stateRegistry: {
      schemaVersion: 2,
      themeId: 'same-year-test',
      axes: { axis: { negativePole: 'low', positivePole: 'high', eventDeltaRange: [-5, 5] } },
      facts: {
        'first.happened': { type: 'boolean', default: false, description: 'First event occurred.' },
        'second.happened': { type: 'boolean', default: false, description: 'Second event occurred.' }
      }
    },
    events: [
      {
        id: 'first-1951', label: 'First', description: 'First event', activation: 'default', baseWeight: 1,
        time: { display: '1951', earliest: '1951-01-01', latest: '1951-12-31', resolution: 'year' },
        commonEffects: {}, sourceRefs: ['test'],
        outcomes: [{ id: 'first-occurs', label: 'Occurs', canonical: true, weight: 1, description: 'Occurs', requirement: null, confidence: 'high', evidenceType: 'documented', rationale: 'Test', effects: { sets: { 'first.happened': true } }, narrativeConsequences: [] }]
      },
      {
        id: 'second-1951', label: 'Second', description: 'Second event', activation: 'default', baseWeight: 1,
        time: { display: '1951', earliest: '1951-01-01', latest: '1951-12-31', resolution: 'year' },
        commonEffects: {}, sourceRefs: ['test'],
        outcomes: [{ id: 'second-occurs', label: 'Occurs', canonical: true, weight: 1, description: 'Occurs', requirement: null, confidence: 'high', evidenceType: 'documented', rationale: 'Test', effects: { sets: { 'second.happened': true } }, narrativeConsequences: [] }]
      }
    ],
    framework: null
  };
  const world = generateWorld(theme, 1);
  assert.equal(world.steps.length, 2);
  assert.deepEqual(new Set(world.steps.map(step => step.eventId)), new Set(['first-1951', 'second-1951']));
});

test('world replay validation detects a tampered state transition', () => {
  const theme = pilotTheme();
  const world = generateWorld(theme, 7);
  world.steps[0].stateAfter.trajectory.accessibility += 1;
  const report = validateCausalWorld(theme, world);
  assert.equal(report.passed, false);
  assert.ok(report.errors.some(error => error.includes('stateAfter')));
});

test('static validation rejects an unknown fact assignment', () => {
  const theme = pilotTheme();
  theme.events[0].outcomes[0].effects.sets['unregistered.fact'] = true;
  const report = validateCausalTheme(theme);
  assert.equal(report.passed, false);
  assert.ok(report.errors.some(error => error.includes('unknown fact')));
});

test('static validation rejects an invalid fact value in a precondition', () => {
  const theme = pilotTheme();
  theme.events[1].requires = {
    all: [{ kind: 'fact', fact: 'stereoscope.ip_model', operator: 'equals', value: 'invented-model' }]
  };
  const report = validateCausalTheme(theme);
  assert.equal(report.passed, false);
  assert.ok(report.errors.some(error => error.includes('invalid value for fact')));
});

test('static validation rejects a closed explicit-event enable cycle', () => {
  const theme = pilotTheme();
  const first = theme.events.find(event => event.id === 'sensorama-arcade-network-1963');
  const second = theme.events.find(event => event.id === 'darpa-somatic-interface-program-1963');
  for (const event of theme.events) {
    for (const outcome of event.outcomes) {
      outcome.effects.enables = (outcome.effects.enables || []).filter(id => id !== first.id && id !== second.id);
    }
  }
  first.outcomes[0].effects.enables = [second.id];
  second.outcomes[0].effects.enables = [first.id];
  const report = validateCausalTheme(theme);
  assert.equal(report.passed, false);
  assert.ok(report.errors.some(error => error.includes('no time-feasible enable chain')));
});
