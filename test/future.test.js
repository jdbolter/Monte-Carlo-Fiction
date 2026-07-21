import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus, loadCorpusSource } from '../sampling/history.js';
import { buildFutureRequest, normalizeFutureInput } from '../sampling/future-generator.js';
import { FUTURE_WORLD_SCHEMA_VERSION, validateFutureWorld } from '../sampling/future-schema.js';
import { makeWorldRecord } from '../sampling/world.js';
import { buildRenderRequest, renderPayload } from '../sampling/render-world.js';

function futureInput(overrides = {}) {
  return normalizeFutureInput({
    mode: 'bounded-corridor',
    baseYear: 2026,
    horizonYear: 2045,
    brief: 'Explore public immersive infrastructure, cultural adoption, resistance, and unequal access through 2045.',
    pivot: 'Cities fund shared immersive infrastructure beginning in 2028.',
    targetCondition: 'Shared projected environments become a major public medium by 2045.',
    scope: 'entertainment, education, public space',
    ...overrides
  });
}

function futureContent() {
  return {
    baseYear: 2026,
    horizonYear: 2045,
    title: 'The Civic Room',
    summary: 'Shared projected environments become ordinary civic and cultural infrastructure.',
    premise: {
      mode: 'bounded-corridor',
      question: 'How could public immersive infrastructure mature without replacing personal media?',
      pivot: { year: 2028, change: 'Cities fund shared immersive infrastructure.', source: 'supplied' },
      targetCondition: { description: 'Shared projected environments become a major public medium by 2045.', source: 'supplied' },
      scope: ['entertainment', 'education', 'public space']
    },
    assumptions: [
      { id: 'a1', claim: 'Durable municipal funding', timing: 'from 2028', plausibility: 'medium' },
      { id: 'a2', claim: 'Cheap solid-state projection', timing: 'early 2030s', plausibility: 'high' },
      { id: 'a3', claim: 'Open spatial content standards', timing: 'by 2032', plausibility: 'medium' }
    ],
    timeline: [
      { id: 'e1', year: 2028, development: 'Pilot civic projection rooms open', consequence: 'Public use cases become visible', causedBy: ['a1'], status: 'adaptation', sourceRefs: ['cave'] },
      { id: 'e2', year: 2030, development: 'Schools share room-scale curricula', consequence: 'Educational procurement lowers costs', causedBy: ['e1'], status: 'adaptation', sourceRefs: ['videoplace'] },
      { id: 'e3', year: 2032, development: 'Open scene standard adopted', consequence: 'Content moves among venues', causedBy: ['a3', 'e2'], status: 'novel', sourceRefs: [] },
      { id: 'e4', year: 2034, development: 'Compact projectors enter community venues', consequence: 'Smaller towns join the network', causedBy: ['a2', 'e3'], status: 'continuation', sourceRefs: ['vitarama-cinerama'] },
      { id: 'e5', year: 2036, development: 'Touring performances link distant rooms', consequence: 'A shared-presence entertainment market forms', causedBy: ['e4'], status: 'adaptation', sourceRefs: [] },
      { id: 'e6', year: 2038, development: 'Biometric audience measurement restricted', consequence: 'Public trust improves unevenly', causedBy: ['e5'], status: 'novel', sourceRefs: [] },
      { id: 'e7', year: 2040, development: 'Cooperative content exchanges expand', consequence: 'Independent production becomes sustainable', causedBy: ['e3', 'e6'], status: 'novel', sourceRefs: [] },
      { id: 'e8', year: 2043, development: 'Accessibility standards become mandatory', consequence: 'Multisensory alternatives spread', causedBy: ['e6', 'e7'], status: 'continuation', sourceRefs: [] },
      { id: 'e9', year: 2045, development: 'Civic rooms become routine infrastructure', consequence: 'A mature mixed-media ecology stabilizes', causedBy: ['e8'], status: 'novel', sourceRefs: [] }
    ],
    endpoint: {
      technicalSystem: ['Networked projection rooms with open scene standards', 'Phones remain primary personal controllers'],
      entertainment: ['Linked performances across public venues', 'Flat video remains the main recorded format'],
      socialMedia: ['Place-based gatherings supplement personal feeds', 'Portable profiles remain optional'],
      institutionsAndEconomy: ['Municipal and cooperative venue ownership', 'Independent spatial-content exchanges'],
      accessAndConflict: ['Geographic gaps in venue quality', 'Persistent biometric-measurement disputes']
    },
    continuities: ['Personal screens remain ubiquitous', 'Physical performance venues remain prestigious', 'Text remains central to education and work'],
    tensions: [
      { issue: 'Public access', description: 'Universal-service goals versus uneven local funding' },
      { issue: 'Measurement', description: 'Responsive environments versus biometric privacy' },
      { issue: 'Creative control', description: 'Open exchange versus platform enclosure' }
    ]
  };
}

test('future input normalizes scope and optional boundaries', () => {
  const input = normalizeFutureInput({ mode: 'open-exploration', baseYear: '2026', horizonYear: '2050', brief: ' A sufficiently detailed open future question. ', scope: 'media, access', pivot: '', targetCondition: '' });
  assert.equal(input.baseYear, 2026);
  assert.deepEqual(input.scope, ['media', 'access']);
  assert.equal(input.pivot, '');
});

test('valid bounded-corridor future passes semantic audit', () => {
  assert.deepEqual(validateFutureWorld(futureContent(), loadCorpus('vr'), futureInput()), []);
});

test('future audit reports mode, chronology, causal, and lineage problems', () => {
  const content = futureContent();
  content.premise.mode = 'open-exploration';
  content.timeline[2].year = 2029;
  content.timeline[3].causedBy = ['later-event'];
  content.timeline[4].sourceRefs = ['invented-lineage'];
  const warnings = validateFutureWorld(content, loadCorpus('vr'), futureInput());
  assert.ok(warnings.some(warning => warning.includes('premise.mode')));
  assert.ok(warnings.some(warning => warning.includes('not chronological')));
  assert.ok(warnings.some(warning => warning.includes('unknown or non-prior')));
  assert.ok(warnings.some(warning => warning.includes('unknown lineage')));
});

test('future request caches lineage and keeps structured input variable', () => {
  const request = buildFutureRequest({ corpusSource: loadCorpusSource('vr'), input: futureInput(), model: 'claude-sonnet-5', variationIndex: 1, batchSize: 2 });
  const [lineage, future] = request.messages[0].content;
  assert.deepEqual(lineage.cache_control, { type: 'ephemeral' });
  assert.equal(future.cache_control, undefined);
  assert.match(lineage.text, /vpl-eyephone/);
  assert.match(future.text, /bounded-corridor/);
  assert.match(future.text, /Generate variant 1 of 2/);
  assert.equal(request.output_config.format.type, 'json_schema');
});

test('future record and renderer preserve the World-kind boundary', () => {
  const world = makeWorldRecord(futureContent(), {
    schema: FUTURE_WORLD_SCHEMA_VERSION, kind: 'future', corpusId: 'vr', corpusHash: 'hash',
    scenarioBrief: futureInput().brief, generationInput: futureInput(), model: 'claude-sonnet-5',
    promptVersion: 'future-v1', batchIndex: 1, batchSize: 1, usage: {}
  });
  assert.equal(world.schema, 'future.v1');
  assert.equal(world.kind, 'future');
  assert.match(world.id, /^future-vr-/);
  assert.equal(world.provenance.generationInput.mode, 'bounded-corridor');
  const payload = renderPayload(world);
  assert.equal(payload.kind, 'future');
  assert.equal(payload.endpoint.technicalSystem.length, 2);
  assert.equal(payload.present, undefined);
  const request = buildRenderRequest(world, { form: 'narrative-history' });
  assert.match(request.messages[0].content, /future scenario/i);
  assert.match(request.messages[0].content, /coherent possibility/i);
});
