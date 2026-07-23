import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { loadCorpus, loadCorpusSource, listCorpora, validateCorpus } from '../sampling/history.js';
import { buildGenerationRequest, clearGenerationDiagnostics, normalizeAlternateHistoryInput, saveGenerationDiagnostic } from '../sampling/world-generator.js';
import { LEGACY_WORLD_SCHEMA_VERSION, validateGeneratedWorld } from '../sampling/world-schema.js';
import { buildRenderRequest, renderPayload } from '../sampling/render-world.js';
import { makeWorldRecord } from '../sampling/world.js';

function sampleContent() {
  return {
    startYear: 1990,
    horizonYear: 2026,
    title: 'The Spatial Web',
    summary: 'Immersive space becomes the ordinary interface for networked entertainment and social life.',
    premise: {
      divergence: {
        year: 1990,
        historicalAnchor: 'vpl-eyephone',
        change: 'VPL releases a practical, low-latency consumer-quality VR system.'
      },
      targetCondition: 'VR becomes the principal successor to the graphical user interface by 2026.',
      scope: ['entertainment', 'social media']
    },
    assumptions: [
      { id: 'a1', claim: 'Small fast displays mature early.', timing: 'by 1990', plausibility: 'low' },
      { id: 'a2', claim: 'Graphics investment follows the headset market.', timing: 'during the 1990s', plausibility: 'medium' },
      { id: 'a3', claim: 'Open spatial standards prevent early fragmentation.', timing: 'by 1996', plausibility: 'medium' }
    ],
    historicalForces: [
      { sourceRefs: ['vpl-eyephone'], legacy: 'Commercial VR vocabulary and embodied interface practice', effect: 'Early consumer systems inherit an established design language' },
      { sourceRefs: ['virtuality-arcade'], legacy: 'Venue-based networked immersion', effect: 'Shared spaces precede household adoption' },
      { sourceRefs: ['second-life'], legacy: 'User-built worlds with internal economies', effect: 'Creator ownership becomes an early policy conflict' },
      { sourceRefs: ['oculus-kickstarter'], legacy: 'Enthusiast hardware communities', effect: 'Open peripheral markets resist platform enclosure' }
    ],
    timeline: [
      { id: 'e1', year: 1990, development: 'VPL launches the system.', consequence: 'VR becomes credible.', causedBy: ['a1', 'a2'], status: 'altered', sourceRefs: ['vpl-eyephone'] },
      { id: 'e2', year: 1993, development: 'Arcades network shared worlds.', consequence: 'Social presence gains a market.', causedBy: ['e1'], status: 'altered', sourceRefs: ['virtuality-arcade'] },
      { id: 'e3', year: 1996, development: 'An open spatial protocol spreads.', consequence: 'Publishers build places as well as pages.', causedBy: ['e2'], status: 'invented', sourceRefs: [] },
      { id: 'e4', year: 2003, development: 'User-built worlds become businesses.', consequence: 'A creator economy forms.', causedBy: ['e3'], status: 'altered', sourceRefs: ['second-life'] },
      { id: 'e5', year: 2012, development: 'Lightweight headsets become ordinary.', consequence: 'Spatial access becomes mobile.', causedBy: ['e4'], status: 'invented', sourceRefs: ['oculus-kickstarter'] },
      { id: 'e6', year: 2017, development: 'Portable identity standards settle.', consequence: 'People move among virtual spaces.', causedBy: ['a3', 'e5'], status: 'invented', sourceRefs: [] },
      { id: 'e7', year: 2022, development: 'Spatial workplaces become routine.', consequence: 'Institutional use broadens beyond entertainment.', causedBy: ['e6'], status: 'invented', sourceRefs: [] },
      { id: 'e8', year: 2024, development: 'Realm governance becomes a public controversy.', consequence: 'Public-interest rules gain support.', causedBy: ['e7'], status: 'invented', sourceRefs: [] },
      { id: 'e9', year: 2026, development: 'Interoperability rules take effect.', consequence: 'A mature but contested spatial web emerges.', causedBy: ['e8'], status: 'invented', sourceRefs: [] }
    ],
    endpoint: {
      technicalSystem: ['Lightweight mixed-reality glasses are the normal personal interface.', 'Open protocols connect persistent spaces.'],
      entertainment: ['Entertainment combines performance, games, and explorable narrative spaces.', 'Flat film and television remain popular.'],
      socialMedia: ['People gather in persistent places rather than primarily consuming feeds.', 'Text messaging remains the low-friction alternative.'],
      institutionsAndEconomy: ['Platforms operate identity and payment infrastructure.', 'Independent communities use open servers.'],
      accessAndConflict: ['Premium tracking creates visible tiers of presence.', 'Biometric data collection remains controversial.']
    },
    continuities: ['Flat screens and recorded video remain useful.', 'People still meet in physical venues.', 'Text remains central to work and education.'],
    tensions: [
      { issue: 'Identity portability', description: 'Users want movement while platforms want lock-in.' },
      { issue: 'Biometric privacy', description: 'Natural interaction requires intimate tracking data.' },
      { issue: 'Access', description: 'Basic access is common but high-fidelity presence is expensive.' }
    ]
  };
}

test('history corpora are discovered and loadable', () => {
  const corpora = listCorpora();
  const ids = corpora.map(corpus => corpus.id);
  assert.deepEqual(ids, ['digital-media', 'silicon-valley', 'vr', 'world-war-ii']);
  assert.equal(loadCorpus('digital-media').events.length, 70);
  assert.ok(loadCorpus('vr').events.length > 50);
  const war = loadCorpus('world-war-ii');
  assert.equal(war.events.length, 67);
  assert.equal(war.events[0].year, 1933);
  assert.equal(war.events.at(-1).year, 1950);
  assert.deepEqual(corpora.find(corpus => corpus.id === 'world-war-ii').experiments, ['alternate-history']);
  assert.ok(corpora.filter(corpus => corpus.id !== 'world-war-ii').every(corpus => corpus.experiments.includes('future')));
});

test('documented history-corpus template satisfies the loader contract', () => {
  const documentation = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'sampling', 'HISTORY-CORPUS-CONTRACT.md'), 'utf8');
  const template = documentation.match(/## Copyable minimum\s+```json\s+([\s\S]*?)```/)?.[1];
  assert.ok(template, 'documented JSON template should be present');
  assert.deepEqual(validateCorpus(JSON.parse(template), 'example-domain'), []);
});

test('valid generated content passes causal validation', () => {
  assert.deepEqual(validateGeneratedWorld(sampleContent(), loadCorpus('vr'), { startYear: 1990, endYear: 2026 }), []);
});

test('a fourth distinct endpoint phrase is accepted', () => {
  const content = sampleContent();
  content.endpoint.technicalSystem.push('Public projection systems use municipal interoperability standards.');
  assert.deepEqual(validateGeneratedWorld(content, loadCorpus('vr')), []);
});

test('validation rejects future causes and invented source ids', () => {
  const content = sampleContent();
  content.timeline[2].causedBy = ['e5'];
  content.timeline[3].sourceRefs = ['not-a-real-event'];
  const errors = validateGeneratedWorld(content, loadCorpus('vr'));
  assert.ok(errors.some(error => error.includes('non-prior cause')));
  assert.ok(errors.some(error => error.includes('unknown corpus event')));
});

test('generation request caches the history and leaves the brief variable', () => {
  const source = loadCorpusSource('vr');
  const request = buildGenerationRequest({
    corpusSource: source,
    input: { startYear: 1990, endYear: 2010, scenarioBrief: 'A sufficiently detailed variable scenario brief for the test.' },
    model: 'claude-sonnet-5',
    variationIndex: 1,
    batchSize: 3
  });
  const [historyBlock, briefBlock] = request.messages[0].content;
  assert.deepEqual(historyBlock.cache_control, { type: 'ephemeral' });
  assert.equal(briefBlock.cache_control, undefined);
  assert.match(historyBlock.text, /vpl-eyephone/);
  assert.match(briefBlock.text, /"startYear": 1990/);
  assert.match(briefBlock.text, /"endYear": 2010/);
  assert.match(briefBlock.text, /variant 1 of 3/i);
  assert.match(request.system, /exactly nine chronological timeline developments/i);
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.equal(request.max_tokens, 6000);
  assert.equal(request.output_config.format.schema.properties.timeline.minItems, undefined);
  assert.equal(request.output_config.format.schema.properties.timeline.maxItems, undefined);
});

test('local validation enforces compact array counts omitted from the API schema', () => {
  const content = sampleContent();
  content.assumptions.pop();
  content.timeline.pop();
  content.endpoint.entertainment.pop();
  content.continuities.pop();
  const errors = validateGeneratedWorld(content, loadCorpus('vr'));
  assert.ok(errors.some(error => error.includes('Three or four enabling assumptions')));
  assert.ok(errors.some(error => error.includes('Exactly nine timeline developments')));
  assert.ok(errors.some(error => error.includes('endpoint.entertainment')));
  assert.ok(errors.some(error => error.includes('Exactly three continuities')));
});

test('truncated generation responses can be saved for diagnosis', () => {
  const directory = mkdtempSync(join(tmpdir(), 'world-diagnostic-test-'));
  const path = saveGenerationDiagnostic(
    { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{\"partial\":' }] },
    { corpusId: 'vr', maxTokens: 5000 },
    directory
  );
  assert.equal(dirname(path), directory);
  const diagnostic = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(diagnostic.response.stop_reason, 'max_tokens');
  assert.equal(diagnostic.context.maxTokens, 5000);
  assert.equal(clearGenerationDiagnostics(directory), 1);
  rmSync(directory, { recursive: true });
});

test('application metadata wraps model-generated content', () => {
  const world = makeWorldRecord(sampleContent(), {
    corpusId: 'vr', corpusHash: 'abc123', scenarioBrief: 'brief', model: 'claude-sonnet-5',
    promptVersion: 'alternate-history-v1', batchIndex: 1, batchSize: 1, usage: {}
  });
  assert.equal(world.schema, 'alternate-history.v1');
  assert.equal(world.kind, 'alternate-history');
  assert.equal(world.domain, 'vr');
  assert.equal(world.validation.status, 'valid');
  assert.deepEqual(world.validation.warnings, []);
  assert.equal(world.provenance.scenarioBrief, 'brief');
  assert.match(world.id, /^alt-vr-/);
});

test('application metadata preserves semantic warnings and their diagnostic', () => {
  const world = makeWorldRecord(sampleContent(), {
    corpusId: 'vr', corpusHash: 'abc123', scenarioBrief: 'brief', model: 'claude-sonnet-5',
    promptVersion: 'alternate-history-v1', batchIndex: 1, batchSize: 1, usage: {},
    validationWarnings: ['Timeline is not chronological at e3.'],
    validationDiagnostic: 'world-generation-example.json'
  });
  assert.equal(world.validation.status, 'warnings');
  assert.deepEqual(world.validation.warnings, ['Timeline is not chronological at e3.']);
  assert.equal(world.validation.diagnosticFile, 'world-generation-example.json');
});

test('alternate-history input normalizes explicit temporal boundaries', () => {
  assert.deepEqual(
    normalizeAlternateHistoryInput({ startYear: '1968', endYear: '1999', scenarioBrief: '  divergence  ' }),
    { startYear: 1968, endYear: 1999, scenarioBrief: 'divergence' }
  );
  assert.equal(LEGACY_WORLD_SCHEMA_VERSION, 'alternate-present.v1');
});

test('render request receives canon and optional direction but no generation provenance or story seeds', () => {
  const world = { ...sampleContent(), id: 'alt-test', domain: 'vr', provenance: { scenarioBrief: 'private input' } };
  const payload = renderPayload(world);
  assert.equal(payload.baseYear, 1990);
  assert.equal(payload.endpoint.technicalSystem.length, 2);
  assert.equal(payload.timeline.length, 9);
  assert.equal(payload.historicalForces.length, 4);
  assert.equal(payload.provenance, undefined);
  assert.equal(payload.livedExamples, undefined);
  const request = buildRenderRequest(world, { form: 'fiction', renderBrief: 'A reluctant older user at a family celebration.' });
  assert.match(request.messages[0].content, /WORLD RECORD/);
  assert.match(request.messages[0].content, /The Spatial Web/);
  assert.match(request.messages[0].content, /reluctant older user/);
  assert.match(request.messages[0].content, /alternate history from 1990 through 2026/i);
  assert.match(request.messages[0].content, /VPL Research/);
  assert.match(request.messages[0].content, /Do not recount the lineage excerpts/);
  assert.doesNotMatch(request.messages[0].content, /private input/);
});

test('existing worlds without historical forces still receive their cited lineage at render time', () => {
  const content = sampleContent();
  content.present = content.endpoint;
  delete content.endpoint;
  delete content.startYear;
  delete content.historicalForces;
  const request = buildRenderRequest({ ...content, id: 'old-alt', kind: 'alternate-present', domain: 'vr' }, { form: 'fiction' });
  assert.match(request.messages[0].content, /Virtuality VR Arcades/);
  assert.doesNotMatch(request.messages[0].content, /"historicalForces"/);
  assert.equal(renderPayload(content).endpoint.technicalSystem.length, 2);
});
