import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { anthropicMessages, usageSummary } from './anthropic.js';
import { resolveCorpusEvents } from './history.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LIBRARY_DIR = join(__dirname, 'outputs', 'library');
export const DEFAULT_RENDER_MODEL = 'claude-sonnet-5';

export const FORMS = {
  'narrative-history': `Write an accessible trajectory narrative of approximately 1,000 words. Trace the major stages to the endpoint, with technology, institutions, public reception, entertainment, and social practices as the principal subjects. Introduce a few people where useful, but do not turn this into a character-centered short story. Explain unfamiliar innovations plainly: what they physically or operationally are, how people use them, and why they matter. Show how inherited historical forces enable, constrain, or redirect the trajectory rather than merely recounting their source events. End with a concrete account of the endpoint year.`,
  fiction: `Write approximately 1,000 words of fiction centered on an ordinary person living in the endpoint year. Invent characters, setting, situation, and plot from the world's endpoint facts and tensions. The world must emerge through action, material details, institutions, and friction rather than an explanatory lecture. Make two or three inherited historical forces perceptible through mature technologies, institutions, habits, language, infrastructure, or conflict, without stopping to recount history. Do not treat old devices from the causal timeline as current technology; depict their mature descendants.`,
  'found-document': `Write a single primary-source document from inside the endpoint year, about 300 words: a notice, listing, warranty, syllabus, obituary, memo, policy, review, or letter. It must read as genuine found material with no external framing.`,
  scene: `Write a single scene of approximately 500 words, with an ordinary person doing an ordinary thing in the endpoint year. Convey the world's institutions, mature technology, benefits, and friction through what happens. Begin inside the scene.`,
  testimony: `Write approximately 450 words of first-person testimony from someone describing an ordinary part of life in the endpoint year. Use plain speech and concrete particulars; the speaker does not know that their world is counterfactual.`
};

export const DEFAULT_FORM = 'narrative-history';

const RENDER_SYSTEM_PROMPT = `You render a completed World record into the requested form. The World may be an alternate present built from a past divergence or a future scenario built from the present. It is authoritative: do not change its premise, causal sequence, endpoint conditions, continuities, or tensions, and do not add another major turn.

For an alternate-present World, narrate the timeline as counterfactual history. For a future World, narrate it as one coherent possibility rather than a prediction, using appropriately conditional framing without repeatedly disclaiming the exercise. Never freeze culture at the pivot or depict an early device as unchanged at the horizon. The endpoint must contain the mature technologies, institutions, media forms, conventions, and conflicts recorded in the World.

Preserve the mixed ecology recorded under continuities. Do not make the central medium govern every message or eliminate every older medium. Avoid automatic utopia, dystopia, ominous science fiction, and frictionless promotional prose. Use the world's actual mixture of benefit, normality, exclusion, irritation, conflict, and pleasure.

The World uses compact phrases rather than publication-ready sentences. Treat them as canonical facts, not wording to copy or mechanically paraphrase. Its historicalForces are authoritative interpretations of how actual history weighs on this World. The accompanying lineage excerpts explain the cited source events but are evidence, not additional events that must be recounted. Compose fresh, fluent prose appropriate to the selected form.

When explaining history, do not merely name or allude to an innovation. State briefly what it was, how it worked or what a person experienced, and what it made newly possible. When writing from inside the world, invent characters and situations that translate the endpoint facts and tensions into concrete action and material detail.

Return only the requested artifact, without discussing the JSON, the exercise, or your planning.`;

export function renderPayload(world) {
  return {
    kind: world.kind || 'alternate-present',
    title: world.title,
    summary: world.summary,
    baseYear: world.baseYear,
    horizonYear: world.horizonYear,
    premise: world.premise,
    assumptions: world.assumptions,
    historicalForces: world.historicalForces,
    timeline: world.timeline,
    endpoint: world.kind === 'future' ? world.endpoint : world.present,
    continuities: world.continuities,
    tensions: world.tensions
  };
}

export function referencedHistory(world) {
  const refs = [
    world.premise?.divergence?.historicalAnchor,
    ...(world.historicalForces || []).flatMap(force => force.sourceRefs || []),
    ...(world.timeline || []).flatMap(event => event.sourceRefs || [])
  ].filter(Boolean);
  try {
    return resolveCorpusEvents(world.domain, [...new Set(refs)]);
  } catch {
    return [];
  }
}

export function buildRenderRequest(world, { form = DEFAULT_FORM, model = DEFAULT_RENDER_MODEL, renderBrief = '' } = {}) {
  const task = FORMS[form] || FORMS[DEFAULT_FORM];
  const kindDirection = world.kind === 'future'
    ? 'This is a future scenario. Present its trajectory as a coherent possibility, not as established history or a confident prediction.'
    : 'This is an alternate-present scenario. Present its trajectory as counterfactual history leading to the alternate present.';
  const brief = String(renderBrief || '').trim();
  const direction = brief
    ? `RENDER BRIEF\n${brief}\n\nUse this brief for choices of focus, viewpoint, setting, tone, or emphasis. It may not contradict the World record.`
    : 'RENDER BRIEF\nNo additional direction. Choose a suitable focus, viewpoint, and setting from the World record.';
  const history = referencedHistory(world);
  const historyDirection = form === 'narrative-history'
    ? 'Use relevant lineage excerpts to explain path dependence and transformation. Do not march through them as a separate chronology or mention source ids.'
    : 'Do not recount the lineage excerpts or mention source ids. Let relevant legacies appear indirectly through endpoint life, mature descendants, institutions, practices, and conflicts.';
  return {
    model,
    max_tokens: ['narrative-history', 'fiction'].includes(form) ? 2600 : 1600,
    thinking: { type: 'disabled' },
    system: RENDER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `${task}\n\n${kindDirection}\n\n${direction}\n\nHISTORICAL USE\n${historyDirection}\n\nWORLD RECORD\n${JSON.stringify(renderPayload(world), null, 2)}\n\nREFERENCED HISTORICAL LINEAGE\n${JSON.stringify(history, null, 2)}`
    }]
  };
}

export async function renderWorld(world, options = {}) {
  const form = options.form || DEFAULT_FORM;
  const model = options.model || DEFAULT_RENDER_MODEL;
  const renderBrief = String(options.renderBrief || '').trim();
  if (!FORMS[form]) throw new Error(`Unknown render form: ${form}`);
  const response = await anthropicMessages(buildRenderRequest(world, { form, model, renderBrief }));
  if (response.stop_reason === 'max_tokens') throw new Error('Rendered artifact was truncated; raise max_tokens.');
  const text = response.content?.find(block => block.type === 'text')?.text;
  if (!text) throw new Error('Renderer returned no text.');
  return { text, usage: usageSummary(response.usage), model, form, renderBrief };
}

export async function renderAndSave(world, options = {}) {
  const rendered = await renderWorld(world, options);
  const id = `${world.id}--${rendered.form}`;
  const record = {
    schema: 'artifact.v1',
    id,
    worldId: world.id,
    worldTitle: world.title,
    worldSummary: world.summary,
    worldKind: world.kind || 'alternate-present',
    domain: world.domain,
    horizonYear: world.horizonYear,
    form: rendered.form,
    model: rendered.model,
    renderBrief: rendered.renderBrief,
    text: rendered.text,
    usage: rendered.usage,
    verdict: '',
    note: '',
    renderedAt: new Date().toISOString()
  };
  mkdirSync(LIBRARY_DIR, { recursive: true });
  writeFileSync(join(LIBRARY_DIR, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export function listArtifacts() {
  if (!existsSync(LIBRARY_DIR)) return [];
  return readdirSync(LIBRARY_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      try { return JSON.parse(readFileSync(join(LIBRARY_DIR, file), 'utf8')); }
      catch { return null; }
    })
    .filter(record => record?.schema === 'artifact.v1')
    .sort((a, b) => b.renderedAt.localeCompare(a.renderedAt));
}

export function renderedFormsByWorld() {
  const map = new Map();
  for (const artifact of listArtifacts()) {
    if (!map.has(artifact.worldId)) map.set(artifact.worldId, new Set());
    map.get(artifact.worldId).add(artifact.form);
  }
  return map;
}

export function setVerdict(id, verdict, note = '') {
  if (!['', 'cohere', 'strain', 'incoherent'].includes(verdict)) throw new Error(`Invalid verdict: ${verdict}`);
  const path = join(LIBRARY_DIR, `${id}.json`);
  if (!existsSync(path)) throw new Error(`No such artifact: ${id}`);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.verdict = verdict;
  record.note = note;
  writeFileSync(path, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export function clearArtifacts() {
  if (!existsSync(LIBRARY_DIR)) return 0;
  let removed = 0;
  for (const file of readdirSync(LIBRARY_DIR).filter(name => name.endsWith('.json'))) {
    try { unlinkSync(join(LIBRARY_DIR, file)); removed++; } catch {}
  }
  return removed;
}
