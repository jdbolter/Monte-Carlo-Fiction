import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { anthropicMessages, usageSummary } from './anthropic.js';
import {
  ALTERNATIVE_PLAN_PROMPT_VERSION,
  buildAlternativePlanRequest,
  validateAlternativePlan
} from './alternative-planner.js';
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

export const GENERATION_SYSTEM_PROMPT = `You support two explicitly named alternate-history tasks using a supplied corpus of real historical events and structured user input.

When the variable user block is headed ALTERNATIVE PLANNING INPUT, design only the requested compact causal routes and return the alternative-plan schema. Do not produce completed Worlds or nine-event timelines.

When the variable user block is headed WORLD GENERATION INPUT, construct one compact, causally coherent alternate-history World record and return the World schema. The following World rules apply to that task:

The supplied startYear is the divergence year and the supplied endYear is the endpoint. Copy both exactly into startYear, premise.divergence.year, and horizonYear respectively. The scenario brief's divergence is a fiat: accept it for the experiment rather than arguing that actual history made it unlikely. Infer the supporting technical, economic, institutional, and social changes required to make it coherent, and mark their plausibility honestly.

Use the history corpus as evidence and raw material, not as a mandatory sequence. After the divergence, real events may be retained, altered, displaced, accelerated, delayed, or omitted. You may invent counterfactual developments, but every development must follow from named assumptions or earlier developments. sourceRefs must be exact ids from the supplied corpus; never invent a source id.

History must exert causal pressure, not merely decorate the timeline. Identify inherited capabilities, institutions, business patterns, cultural practices, and remembered failures that make some paths easier and others harder. Record exactly four of these under historicalForces. Each force must cite one or more corpus events and state both the inherited legacy and its concrete effect on this alternate trajectory or endpoint. Do not merely summarize the cited event.

Construct a mature endpoint, not a museum of the divergence era. Devices, interfaces, media forms, institutions, business models, creative practices, and social conventions must continue evolving across the timeline. Never imply that an old device remains current merely because it caused the divergence.

Preserve a mixed media ecology. A successful new medium does not automatically eliminate text, flat screens, phones, physical venues, or every familiar institution. State important continuities explicitly. Include ordinary benefits, inconveniences, exclusions, failures, resistance, and power conflicts; do not default to either utopia or dystopia.

Make the endpoint concrete enough for later narrative history and fiction renderers. Record the facts those renderers need, but do not anticipate their prose, characters, scenes, plots, or examples of ordinary life.

The World record is compact source data, not reader-facing prose. Prefer short noun phrases and verb phrases. Sentence fragments are welcome. Use a complete sentence only when a phrase would be ambiguous. Do not add transitions, scene-setting, rhetoric, atmosphere, illustrative anecdotes, or miniature stories. State each fact once in its most specific field.

Output discipline:
- Copy the supplied startYear and endYear exactly. All timeline developments must fall within those inclusive boundaries.
- Supply three or four assumptions and exactly nine chronological timeline developments. Count them before returning the record.
- Supply exactly four historicalForces grounded in cited corpus events.
- Prefer two or three compact factual phrases in each endpoint section; use a fourth only for a distinct fact that does not fit elsewhere. Follow them with exactly three continuities and three tensions.
- Keep timeline development and consequence values distinct and usually under eighteen words each.
- The timeline records change over time; endpoint records conditions in the supplied ending year only. Never restate a timeline event in endpoint.
- causedBy may reference assumption ids or earlier timeline ids only.
- Corpus event ids belong in sourceRefs, never in causedBy.
- status is retained for a substantially unchanged real event, altered for a transformed real event, and invented for a counterfactual event without a direct real counterpart.
- sourceRefs may be empty, especially for invented events.
- Preserve causal and operational information, but remove explanatory wording a renderer can reconstruct.
- During WORLD GENERATION, return only the structured World content required by the schema.

Alternative planning discipline:
- Honor the same stipulated divergence, starting year, and ending year in every route.
- Produce exactly alternativeCount routes and count them before returning.
- Make routes substantively different in causal mechanism, institutional or actor response, treatment of historical events, and expected ending-year settlement—not merely in tone, characters, or wording.
- Derive the important uncertainties from this corpus and divergence. Possible distinctions include coalitions, state or institutional decisions, material constraints, geographic centers, resistance, secondary shocks, partial success, backlash, or displacement.
- Give each route two to four decisiveMechanisms and one to six eventsToTransform.
- eventsToTransform values must be exact ids from the supplied corpus.
- Keep each route compact. State a causal thesis and endpoint distinction, but do not prewrite its full timeline or prose.
- During ALTERNATIVE PLANNING, return only the structured alternative plan required by its schema.`;

export function normalizeAlternateHistoryInput(input = {}) {
  return {
    startYear: Number(input.startYear),
    endYear: Number(input.endYear),
    scenarioBrief: String(input.scenarioBrief || '').trim()
  };
}

export function buildGenerationRequest({ corpusSource, input, scenarioBrief, startYear, endYear, model, alternativeIndex = 1, batchSize = 1, alternativeRoute = null }) {
  const historyInput = normalizeAlternateHistoryInput(input || { scenarioBrief, startYear, endYear });
  const assignment = alternativeRoute
    ? `\n\nASSIGNED ALTERNATIVE ROUTE\n${JSON.stringify(alternativeRoute, null, 2)}\n\nDevelop this route into the complete World. Preserve its causal thesis, mechanisms, historical-event transformations, and endpoint distinction; do not drift into a different route.`
    : '\n\nNo preliminary route plan was requested because this is a single-World generation.';
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
          text: `WORLD GENERATION INPUT\n${JSON.stringify(historyInput, null, 2)}\n\nGenerate alternative ${alternativeIndex} of ${batchSize}.${assignment}`
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

export async function planAlternativeRoutes({ corpusId, input, count, model = DEFAULT_GENERATION_MODEL }) {
  const corpus = loadCorpus(corpusId);
  const source = loadCorpusSource(corpusId);
  const historyInput = normalizeAlternateHistoryInput(input);
  const request = buildAlternativePlanRequest({
    corpusSource: source,
    input: historyInput,
    count,
    model,
    systemPrompt: GENERATION_SYSTEM_PROMPT
  });
  const response = await anthropicMessages(request);
  if (response.stop_reason === 'max_tokens') {
    const diagnosticPath = saveGenerationDiagnostic(response, {
      reason: 'alternative-plan-max-tokens', corpusId, historyInput, model,
      alternativeCount: count, maxTokens: request.max_tokens
    });
    throw new Error(`Alternative planning was truncated at ${request.max_tokens} tokens. Diagnostic saved to ${diagnosticPath}.`);
  }
  if (response.stop_reason === 'refusal') throw new Error('The model refused the alternative-planning request.');

  const text = response.content?.find(block => block.type === 'text')?.text;
  if (!text) throw new Error('Alternative planning returned no JSON text.');

  let plan;
  try {
    plan = JSON.parse(text);
  } catch (error) {
    const diagnosticPath = saveGenerationDiagnostic(response, {
      reason: 'alternative-plan-json', corpusId, historyInput, model,
      alternativeCount: count, error: error.message
    });
    throw new Error(`Alternative-plan JSON could not be parsed. Diagnostic saved to ${diagnosticPath}.`);
  }

  const errors = validateAlternativePlan(plan, corpus, count);
  if (errors.length) {
    const diagnosticPath = saveGenerationDiagnostic(response, {
      reason: 'alternative-plan-validation', corpusId, historyInput, model,
      alternativeCount: count, errors
    });
    throw new Error(`Alternative plan failed validation: ${errors.join(' ')} Diagnostic saved to ${diagnosticPath}.`);
  }
  return {
    ...plan,
    model,
    promptVersion: ALTERNATIVE_PLAN_PROMPT_VERSION,
    usage: usageSummary(response.usage)
  };
}

export async function generateWorld({ corpusId, input, scenarioBrief, startYear, endYear, model = DEFAULT_GENERATION_MODEL, alternativeIndex = 1, batchSize = 1, alternativeRoute = null }) {
  const corpus = loadCorpus(corpusId);
  const source = loadCorpusSource(corpusId);
  const historyInput = normalizeAlternateHistoryInput(input || { scenarioBrief, startYear, endYear });
  const request = buildGenerationRequest({ corpusSource: source, input: historyInput, model, alternativeIndex, batchSize, alternativeRoute });
  const response = await anthropicMessages(request);
  if (response.stop_reason === 'max_tokens') {
    const diagnosticPath = saveGenerationDiagnostic(response, {
      reason: 'max_tokens', corpusId, historyInput, model, alternativeIndex, batchSize,
      alternativeRoute, attempt: 1, maxTokens: request.max_tokens
    });
    throw new Error(`World generation was truncated at ${request.max_tokens} tokens. Diagnostic saved to ${diagnosticPath}.`);
  }
  if (response.stop_reason === 'refusal') throw new Error('The model refused the world-generation request.');

  const text = response.content?.find(block => block.type === 'text')?.text;
  if (!text) throw new Error('World generation returned no JSON text.');

  let content;
  try { content = JSON.parse(text); }
  catch (error) { throw new Error(`Structured world JSON could not be parsed: ${error.message}`); }

  const validationWarnings = validateGeneratedWorld(content, corpus, historyInput);
  const diagnosticPath = validationWarnings.length
    ? saveGenerationDiagnostic(response, {
        reason: 'validation', errors: validationWarnings, corpusId, historyInput, model,
        alternativeIndex, batchSize, alternativeRoute, attempt: 1, maxTokens: request.max_tokens
      })
    : null;

  return makeWorldRecord(content, {
    corpusId,
    corpusHash: corpusHash(source),
    kind: 'alternate-history',
    scenarioBrief: historyInput.scenarioBrief,
    generationInput: historyInput,
    model,
    promptVersion: GENERATION_PROMPT_VERSION,
    batchIndex: alternativeIndex,
    batchSize,
    alternativeRoute,
    usage: usageSummary(response.usage),
    validationWarnings,
    validationDiagnostic: diagnosticPath ? basename(diagnosticPath) : null
  });
}

export async function generateWorldBatch({ corpusId, input, scenarioBrief, startYear, endYear, count = 1, model = DEFAULT_GENERATION_MODEL, save = true }) {
  const worlds = [];
  const errors = [];
  const total = Math.max(1, Math.min(20, Number(count) || 1));
  const historyInput = normalizeAlternateHistoryInput(input || { scenarioBrief, startYear, endYear });
  let planning = null;

  if (total > 1) {
    try {
      planning = await planAlternativeRoutes({ corpusId, input: historyInput, count: total, model });
    } catch (error) {
      return {
        worlds,
        errors: [{ stage: 'planning', error: error.message }],
        planning: null
      };
    }
  }

  // Sequential by design: the first response must begin before Anthropic can reuse
  // the cached history prefix in the next request. For batches, the planning
  // response creates that cache entry before route-specific World generation.
  for (let index = 1; index <= total; index++) {
    try {
      const world = await generateWorld({
        corpusId,
        input: historyInput,
        model,
        alternativeIndex: index,
        batchSize: total,
        alternativeRoute: planning?.alternatives[index - 1] || null
      });
      if (save) saveWorld(world);
      worlds.push(world);
    } catch (error) {
      errors.push({ stage: 'generation', index, routeId: planning?.alternatives[index - 1]?.id || null, error: error.message });
    }
  }

  return {
    worlds,
    errors,
    planning: planning ? {
      model: planning.model,
      promptVersion: planning.promptVersion,
      usage: planning.usage,
      alternativeCount: planning.alternatives.length
    } : null
  };
}
