import { basename } from 'path';
import { anthropicMessages, usageSummary } from './anthropic.js';
import { corpusHash, loadCorpus, loadCorpusSource } from './history.js';
import { makeWorldRecord, saveWorld } from './world.js';
import { saveGenerationDiagnostic } from './world-generator.js';
import {
  FUTURE_PROMPT_VERSION,
  FUTURE_WORLD_SCHEMA_VERSION,
  GENERATED_FUTURE_SCHEMA,
  validateFutureWorld
} from './future-schema.js';

export const DEFAULT_FUTURE_MODEL = 'claude-sonnet-5';

const MODE_INSTRUCTIONS = {
  'pivot-forward': 'Treat the supplied pivot as a fiat. Project forward from it. If no target condition is supplied, infer a consequential but plausible endpoint rather than steering toward a predetermined conclusion.',
  'endpoint-backcast': 'Treat the supplied target condition as a fiat. Infer a plausible near-term pivot and the prerequisites needed to reach the target. Although reasoning may backcast, output the timeline in forward chronological order.',
  'bounded-corridor': 'Treat both the supplied pivot and target condition as authoritative corridor boundaries. Infer multiple connecting mechanisms without merely restating either boundary.',
  'open-exploration': 'Use the brief and historical lineage to infer both a plausible near-term pivot and a distinctive endpoint. Explore one coherent possibility, not a prediction or a median forecast.'
};

export const FUTURE_SYSTEM_PROMPT = `You construct compact, causally coherent future World records from a historical lineage and structured speculative inputs.

The historical corpus establishes technological, institutional, and cultural lineage. Use it as evidence about paths, constraints, recurring patterns, and inherited systems—not as a list of future milestones. sourceRefs must be exact corpus ids. Corpus ids belong only in sourceRefs, never in causedBy.

Respect the selected generation mode. Supplied pivots and target conditions are experimental fiats. Inferred pivots and endpoints must be distinctive, operationally concrete, and consistent with the brief. This is scenario construction, not prediction: avoid presenting the result as inevitable or most likely.

Build a forward chronological causal trajectory from the base year to the horizon. Each projected development must follow from assumptions or earlier projected developments. Include technical change together with institutions, business models, public reception, regulation, cultural uses, resistance, uneven access, and failure.

Construct a mature endpoint rather than preserving near-term devices unchanged. Preserve a mixed media ecology and important continuities. Do not default to exponential progress, universal adoption, technological substitution, utopia, dystopia, or ominous science fiction.

The World is compact source data for later narrative and fiction rendering. Prefer noun and verb phrases; fragments are welcome. Do not write scenes, characters, anecdotes, transitions, atmosphere, or publication-ready prose. State each fact once.

Output discipline:
- Copy the supplied baseYear, horizonYear, and mode exactly.
- Produce a pivot and targetCondition in every mode; mark each source as supplied or inferred accurately.
- Supply three or four assumptions and exactly nine chronological projected developments.
- Prefer two or three compact phrases per endpoint section; use a fourth only for a distinct fact.
- causedBy may contain assumption ids or earlier timeline ids only.
- status is continuation for an extension of an established trajectory, adaptation for a redirected inherited system, and novel for a development without a close lineage precedent.
- Supply exactly three continuities and three tensions.
- Return only the structured World content required by the schema.`;

export function normalizeFutureInput(input = {}) {
  return {
    mode: String(input.mode || ''),
    baseYear: Number(input.baseYear),
    horizonYear: Number(input.horizonYear),
    brief: String(input.brief || '').trim(),
    pivot: String(input.pivot || '').trim(),
    targetCondition: String(input.targetCondition || '').trim(),
    scope: Array.isArray(input.scope)
      ? input.scope.map(value => String(value).trim()).filter(Boolean)
      : String(input.scope || '').split(',').map(value => value.trim()).filter(Boolean)
  };
}

export function buildFutureRequest({ corpusSource, input, model, variationIndex, batchSize, priorWorlds = [] }) {
  const futureInput = normalizeFutureInput(input);
  const prior = priorWorlds.length
    ? `\nOTHER VARIANTS ALREADY GENERATED\n${priorWorlds.map(world => `- ${world.title}: ${world.summary}`).join('\n')}\nChoose a materially different pivot, causal route, or institutional settlement while respecting supplied boundaries.`
    : '';
  return {
    model: model || DEFAULT_FUTURE_MODEL,
    max_tokens: 6000,
    thinking: { type: 'disabled' },
    system: FUTURE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `HISTORICAL LINEAGE\nThe following JSON is the complete historical lineage for this domain.\n\n${corpusSource}`,
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: `FUTURE SPECULATION INPUT\n${JSON.stringify(futureInput, null, 2)}\n\nMODE RULE\n${MODE_INSTRUCTIONS[futureInput.mode]}\n\nGenerate variant ${variationIndex} of ${batchSize}.${prior}`
        }
      ]
    }],
    output_config: {
      format: { type: 'json_schema', schema: GENERATED_FUTURE_SCHEMA }
    }
  };
}

export async function generateFutureWorld({ corpusId, input, model = DEFAULT_FUTURE_MODEL, variationIndex = 1, batchSize = 1, priorWorlds = [] }) {
  const corpus = loadCorpus(corpusId);
  const source = loadCorpusSource(corpusId);
  const futureInput = normalizeFutureInput(input);
  const request = buildFutureRequest({ corpusSource: source, input: futureInput, model, variationIndex, batchSize, priorWorlds });
  const response = await anthropicMessages(request);

  if (response.stop_reason === 'max_tokens') {
    const diagnosticPath = saveGenerationDiagnostic(response, {
      reason: 'max_tokens', worldKind: 'future', corpusId, futureInput, model,
      variationIndex, batchSize, attempt: 1, maxTokens: request.max_tokens
    });
    throw new Error(`Future generation was truncated at ${request.max_tokens} tokens. Diagnostic saved to ${diagnosticPath}.`);
  }
  if (response.stop_reason === 'refusal') throw new Error('The model refused the future-generation request.');

  const text = response.content?.find(block => block.type === 'text')?.text;
  if (!text) throw new Error('Future generation returned no JSON text.');
  let content;
  try { content = JSON.parse(text); }
  catch (error) { throw new Error(`Structured future JSON could not be parsed: ${error.message}`); }

  const validationWarnings = validateFutureWorld(content, corpus, futureInput);
  const diagnosticPath = validationWarnings.length
    ? saveGenerationDiagnostic(response, {
        reason: 'validation', worldKind: 'future', errors: validationWarnings, corpusId,
        futureInput, model, variationIndex, batchSize, attempt: 1, maxTokens: request.max_tokens
      })
    : null;

  return makeWorldRecord(content, {
    schema: FUTURE_WORLD_SCHEMA_VERSION,
    kind: 'future',
    corpusId,
    corpusHash: corpusHash(source),
    scenarioBrief: futureInput.brief,
    generationInput: futureInput,
    model,
    promptVersion: FUTURE_PROMPT_VERSION,
    batchIndex: variationIndex,
    batchSize,
    usage: usageSummary(response.usage),
    validationWarnings,
    validationDiagnostic: diagnosticPath ? basename(diagnosticPath) : null
  });
}

export async function generateFutureWorldBatch({ corpusId, input, count = 1, model = DEFAULT_FUTURE_MODEL, save = true }) {
  const worlds = [];
  const errors = [];
  const total = Math.max(1, Math.min(20, Number(count) || 1));
  for (let index = 1; index <= total; index++) {
    try {
      const world = await generateFutureWorld({
        corpusId, input, model, variationIndex: index, batchSize: total, priorWorlds: worlds
      });
      if (save) saveWorld(world);
      worlds.push(world);
    } catch (error) {
      errors.push({ index, error: error.message });
    }
  }
  return { worlds, errors };
}
