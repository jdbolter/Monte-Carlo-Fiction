import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { anthropicMessages, usageSummary } from './anthropic.js';
import { corpusHash, loadCorpus, loadCorpusSource } from './history.js';
import { makeWorldRecord, saveWorld } from './world.js';
import {
  GENERATED_WORLD_SCHEMA,
  GENERATION_PROMPT_VERSION,
  validateGeneratedWorld
} from './world-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const GENERATION_DIAGNOSTIC_DIR = join(__dirname, 'outputs', 'diagnostics');
export const DEFAULT_GENERATION_MODEL = 'claude-sonnet-5';

export function saveGenerationDiagnostic(response, context = {}, directory = GENERATION_DIAGNOSTIC_DIR) {
  mkdirSync(directory, { recursive: true });
  const timestamp = new Date().toISOString();
  const filename = `world-generation-${timestamp.replace(/[:.]/g, '-')}.json`;
  const path = join(directory, filename);
  writeFileSync(path, JSON.stringify({
    schema: 'world-generation-diagnostic.v1',
    savedAt: timestamp,
    context,
    response
  }, null, 2), 'utf8');
  return path;
}

export function clearGenerationDiagnostics(directory = GENERATION_DIAGNOSTIC_DIR) {
  if (!existsSync(directory)) return 0;
  let removed = 0;
  for (const file of readdirSync(directory).filter(name => name.endsWith('.json'))) {
    try { unlinkSync(join(directory, file)); removed++; } catch {}
  }
  return removed;
}

export const GENERATION_SYSTEM_PROMPT = `You construct compact, causally coherent alternate-present World records from a supplied corpus of real historical events and a variable scenario brief.

The scenario brief is authoritative. Its divergence is a fiat: accept it for the experiment rather than arguing that actual history made it unlikely. Infer the supporting technical, economic, institutional, and social changes required to make it coherent, and mark their plausibility honestly.

Use the history corpus as evidence and raw material, not as a mandatory sequence. After the divergence, real events may be retained, altered, displaced, accelerated, delayed, or omitted. You may invent counterfactual developments, but every development must follow from named assumptions or earlier developments. sourceRefs must be exact ids from the supplied corpus; never invent a source id.

History must exert causal pressure, not merely decorate the timeline. Identify inherited capabilities, institutions, business patterns, cultural practices, and remembered failures that make some paths easier and others harder. Record exactly four of these under historicalForces. Each force must cite one or more corpus events and state both the inherited legacy and its concrete effect on this alternate trajectory or endpoint. Do not merely summarize the cited event.

Construct a mature endpoint, not a museum of the divergence era. Devices, interfaces, media forms, institutions, business models, creative practices, and social conventions must continue evolving across the timeline. Never imply that an old device remains current merely because it caused the divergence.

Preserve a mixed media ecology. A successful new medium does not automatically eliminate text, flat screens, phones, physical venues, or every familiar institution. State important continuities explicitly. Include ordinary benefits, inconveniences, exclusions, failures, resistance, and power conflicts; do not default to either utopia or dystopia.

Make the endpoint concrete enough for later narrative history and fiction renderers. Record the facts those renderers need, but do not anticipate their prose, characters, scenes, plots, or examples of ordinary life.

The World record is compact source data, not reader-facing prose. Prefer short noun phrases and verb phrases. Sentence fragments are welcome. Use a complete sentence only when a phrase would be ambiguous. Do not add transitions, scene-setting, rhetoric, atmosphere, illustrative anecdotes, or miniature stories. State each fact once in its most specific field.

Output discipline:
- Infer all years from the scenario and causal logic. If the brief says "the present" without a year, use 2026.
- Supply three or four assumptions and exactly nine chronological timeline developments. Count them before returning the record.
- Supply exactly four historicalForces grounded in cited corpus events.
- Prefer two or three compact factual phrases in each present section; use a fourth only for a distinct fact that does not fit elsewhere. Follow them with exactly three continuities and three tensions.
- Keep timeline development and consequence values distinct and usually under eighteen words each.
- The timeline records change over time; present records endpoint conditions only. Never restate a timeline event in present.
- causedBy may reference assumption ids or earlier timeline ids only.
- Corpus event ids belong in sourceRefs, never in causedBy.
- status is retained for a substantially unchanged real event, altered for a transformed real event, and invented for a counterfactual event without a direct real counterpart.
- sourceRefs may be empty, especially for invented events.
- Preserve causal and operational information, but remove explanatory wording a renderer can reconstruct.
- Return only the structured World content required by the schema.`;

export function buildGenerationRequest({ corpusSource, scenarioBrief, model, variationIndex, batchSize, priorWorlds = [] }) {
  const prior = priorWorlds.length
    ? `\nOther variants already generated from this brief:\n${priorWorlds.map(world => `- ${world.title}: ${world.summary}`).join('\n')}\nChoose a materially different causal route or institutional settlement.`
    : '';
  return {
    model: model || DEFAULT_GENERATION_MODEL,
    max_tokens: 6000,
    thinking: { type: 'disabled' },
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `HISTORY CORPUS\nThe following JSON is the complete historical source for this domain.\n\n${corpusSource}`,
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: `SCENARIO BRIEF\n${scenarioBrief}\n\nGenerate variant ${variationIndex} of ${batchSize}.${prior}`
        }
      ]
    }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: GENERATED_WORLD_SCHEMA
      }
    }
  };
}

export async function generateWorld({ corpusId, scenarioBrief, model = DEFAULT_GENERATION_MODEL, variationIndex = 1, batchSize = 1, priorWorlds = [] }) {
  const corpus = loadCorpus(corpusId);
  const source = loadCorpusSource(corpusId);
  const request = buildGenerationRequest({ corpusSource: source, scenarioBrief, model, variationIndex, batchSize, priorWorlds });
  const response = await anthropicMessages(request);
  if (response.stop_reason === 'max_tokens') {
    const diagnosticPath = saveGenerationDiagnostic(response, {
      reason: 'max_tokens', corpusId, scenarioBrief, model, variationIndex, batchSize,
      attempt: 1, maxTokens: request.max_tokens
    });
    throw new Error(`World generation was truncated at ${request.max_tokens} tokens. Diagnostic saved to ${diagnosticPath}.`);
  }
  if (response.stop_reason === 'refusal') throw new Error('The model refused the world-generation request.');

  const text = response.content?.find(block => block.type === 'text')?.text;
  if (!text) throw new Error('World generation returned no JSON text.');

  let content;
  try { content = JSON.parse(text); }
  catch (error) { throw new Error(`Structured world JSON could not be parsed: ${error.message}`); }

  const validationWarnings = validateGeneratedWorld(content, corpus);
  const diagnosticPath = validationWarnings.length
    ? saveGenerationDiagnostic(response, {
        reason: 'validation', errors: validationWarnings, corpusId, scenarioBrief, model,
        variationIndex, batchSize, attempt: 1, maxTokens: request.max_tokens
      })
    : null;

  return makeWorldRecord(content, {
    corpusId,
    corpusHash: corpusHash(source),
    scenarioBrief,
    model,
    promptVersion: GENERATION_PROMPT_VERSION,
    batchIndex: variationIndex,
    batchSize,
    usage: usageSummary(response.usage),
    validationWarnings,
    validationDiagnostic: diagnosticPath ? basename(diagnosticPath) : null
  });
}

export async function generateWorldBatch({ corpusId, scenarioBrief, count = 1, model = DEFAULT_GENERATION_MODEL, save = true }) {
  const worlds = [];
  const errors = [];
  const total = Math.max(1, Math.min(20, Number(count) || 1));

  // Sequential by design: the first response must begin before Anthropic can reuse
  // the cached history prefix in the next request.
  for (let index = 1; index <= total; index++) {
    try {
      const world = await generateWorld({
        corpusId,
        scenarioBrief,
        model,
        variationIndex: index,
        batchSize: total,
        priorWorlds: worlds
      });
      if (save) saveWorld(world);
      worlds.push(world);
    } catch (error) {
      errors.push({ index, error: error.message });
    }
  }

  return { worlds, errors };
}
