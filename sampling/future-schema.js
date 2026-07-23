export const FUTURE_WORLD_SCHEMA_VERSION = 'future.v1';
export const FUTURE_PROMPT_VERSION = 'future-v2';
export const FUTURE_MODES = ['pivot-forward', 'endpoint-backcast', 'bounded-corridor', 'open-exploration'];

const stringArray = description => ({
  type: 'array',
  description,
  items: { type: 'string' }
});

const endpointSection = description => stringArray(
  `${description} Prefer two or three compact factual phrases about the horizon year; use a fourth only for a distinct fact. Do not repeat timeline developments.`
);

const sourcedCondition = (statementKey, statementDescription) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    [statementKey]: { type: 'string', description: statementDescription },
    source: { type: 'string', enum: ['supplied', 'inferred'] }
  },
  required: [statementKey, 'source']
});

const historicalForces = {
  type: 'array',
  description: 'Exactly four compact interpretations of how historical lineage continues to enable, constrain, or redirect this future.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sourceRefs: stringArray('One or more exact ids from the supplied historical lineage supporting this force.'),
      legacy: { type: 'string', description: 'Compact phrase naming the inherited capability, institution, business pattern, cultural practice, or remembered failure.' },
      effect: { type: 'string', description: 'Compact phrase stating how that inheritance enables, constrains, or redirects the projected trajectory or endpoint.' }
    },
    required: ['sourceRefs', 'legacy', 'effect']
  }
};

export const GENERATED_FUTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    baseYear: { type: 'integer', description: 'The starting year supplied by the user.' },
    horizonYear: { type: 'integer', description: 'The future endpoint year supplied by the user.' },
    title: { type: 'string', description: 'A short, distinctive title for this future World.' },
    summary: { type: 'string', description: 'One sentence stating the defining trajectory and endpoint.' },
    premise: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: FUTURE_MODES },
        question: { type: 'string', description: 'Compact restatement of the user brief and central speculative question.' },
        pivot: {
          type: 'object',
          additionalProperties: false,
          properties: {
            year: { type: 'integer', description: 'Year of the supplied or inferred near-term pivot.' },
            change: { type: 'string', description: 'Compact statement of the pivot.' },
            source: { type: 'string', enum: ['supplied', 'inferred'] }
          },
          required: ['year', 'change', 'source']
        },
        targetCondition: sourcedCondition('description', 'Compact statement of the supplied or inferred horizon condition.'),
        scope: stringArray('Domains and questions emphasized by the user input.')
      },
      required: ['mode', 'question', 'pivot', 'targetCondition', 'scope']
    },
    assumptions: {
      type: 'array',
      description: 'Three or four enabling conditions supporting the future trajectory.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Short unique id such as a1.' },
          claim: { type: 'string', description: 'Compact technical, economic, institutional, environmental, or social condition.' },
          timing: { type: 'string', description: 'When the condition must hold.' },
          plausibility: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['id', 'claim', 'timing', 'plausibility']
      }
    },
    historicalForces,
    timeline: {
      type: 'array',
      description: 'Exactly nine chronological projected developments from the base year toward the horizon.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Short unique id such as e1.' },
          year: { type: 'integer' },
          development: { type: 'string', description: 'Compact factual phrase naming the projected development; usually under 18 words.' },
          consequence: { type: 'string', description: 'Compact phrase naming what changes or becomes possible next; usually under 18 words.' },
          causedBy: stringArray('Ids of assumptions or earlier projected developments only.'),
          status: { type: 'string', enum: ['continuation', 'adaptation', 'novel'] },
          sourceRefs: stringArray('Exact ids from the supplied historical lineage that inform this projection; empty when none applies.')
        },
        required: ['id', 'year', 'development', 'consequence', 'causedBy', 'status', 'sourceRefs']
      }
    },
    endpoint: {
      type: 'object',
      additionalProperties: false,
      properties: {
        technicalSystem: endpointSection('Mature technologies, operations, infrastructure, and standards.'),
        entertainment: endpointSection('Entertainment forms, practices, and creative institutions.'),
        socialMedia: endpointSection('Communication, identity, attention, status, and communities.'),
        institutionsAndEconomy: endpointSection('Companies, public institutions, ownership, standards, and business models.'),
        accessAndConflict: endpointSection('Costs, exclusions, regulation, inequalities, resistance, failures, and conflicts.')
      },
      required: ['technicalSystem', 'entertainment', 'socialMedia', 'institutionsAndEconomy', 'accessAndConflict']
    },
    continuities: stringArray('Exactly three compact phrases naming important present-day media, practices, or institutions that persist at the horizon.'),
    tensions: {
      type: 'array',
      description: 'Exactly three unresolved tensions that prevent a simple utopia or dystopia.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          issue: { type: 'string' },
          description: { type: 'string', description: 'Compact phrase stating opposed interests or unresolved pressure.' }
        },
        required: ['issue', 'description']
      }
    }
  },
  required: ['baseYear', 'horizonYear', 'title', 'summary', 'premise', 'assumptions', 'historicalForces', 'timeline', 'endpoint', 'continuities', 'tensions']
};

export function validateFutureWorld(world, corpus, input = {}) {
  const warnings = [];
  if (!world || typeof world !== 'object') return ['Output is not an object.'];

  const eventIds = new Set(corpus.events.map(event => event.id));
  const baseYear = Number(input.baseYear);
  const horizonYear = Number(input.horizonYear);
  if (world.baseYear !== baseYear) warnings.push(`baseYear should be ${baseYear}.`);
  if (world.horizonYear !== horizonYear) warnings.push(`horizonYear should be ${horizonYear}.`);
  if (world.premise?.mode !== input.mode) warnings.push(`premise.mode should be ${input.mode}.`);
  if (world.baseYear >= world.horizonYear) warnings.push('baseYear must precede horizonYear.');

  const expectedPivotSource = input.pivot ? 'supplied' : 'inferred';
  const expectedTargetSource = input.targetCondition ? 'supplied' : 'inferred';
  if (world.premise?.pivot?.source !== expectedPivotSource) warnings.push(`pivot.source should be ${expectedPivotSource}.`);
  if (world.premise?.targetCondition?.source !== expectedTargetSource) warnings.push(`targetCondition.source should be ${expectedTargetSource}.`);
  if (world.premise?.pivot?.year < world.baseYear || world.premise?.pivot?.year > world.horizonYear) {
    warnings.push('The pivot year must fall between the base and horizon years.');
  }

  if (!Array.isArray(world.assumptions) || world.assumptions.length < 3 || world.assumptions.length > 4) {
    warnings.push('Three or four enabling assumptions are expected.');
  }
  if (!Array.isArray(world.historicalForces) || world.historicalForces.length !== 4) {
    warnings.push('Exactly four historical forces are expected.');
  }
  for (const [index, force] of (world.historicalForces || []).entries()) {
    if (!Array.isArray(force.sourceRefs) || force.sourceRefs.length === 0) {
      warnings.push(`historicalForces[${index}] should cite at least one lineage event.`);
    }
    for (const ref of force.sourceRefs || []) {
      if (!eventIds.has(ref)) warnings.push(`historicalForces[${index}] references unknown lineage event: ${ref}`);
    }
  }
  if (!Array.isArray(world.timeline) || world.timeline.length !== 9) {
    warnings.push('Exactly nine projected timeline developments are expected.');
  }

  const knownCauses = new Set();
  for (const assumption of world.assumptions || []) {
    if (knownCauses.has(assumption.id)) warnings.push(`Duplicate id: ${assumption.id}`);
    knownCauses.add(assumption.id);
  }

  let priorYear = -Infinity;
  for (const event of world.timeline || []) {
    if (knownCauses.has(event.id)) warnings.push(`Duplicate id: ${event.id}`);
    if (event.year < world.baseYear) warnings.push(`${event.id} occurs before the base year.`);
    if (event.year > world.horizonYear) warnings.push(`${event.id} occurs after the horizon year.`);
    if (event.year < priorYear) warnings.push(`Timeline is not chronological at ${event.id}.`);
    for (const cause of event.causedBy || []) {
      if (!knownCauses.has(cause)) warnings.push(`${event.id} has unknown or non-prior cause: ${cause}`);
    }
    for (const ref of event.sourceRefs || []) {
      if (!eventIds.has(ref)) warnings.push(`${event.id} references unknown lineage event: ${ref}`);
    }
    priorYear = event.year;
    knownCauses.add(event.id);
  }

  for (const [key, values] of Object.entries(world.endpoint || {})) {
    if (!Array.isArray(values) || values.length < 2 || values.length > 4) {
      warnings.push(`endpoint.${key} should contain two to four phrases.`);
    }
  }
  if (!Array.isArray(world.continuities) || world.continuities.length !== 3) warnings.push('Exactly three continuities are expected.');
  if (!Array.isArray(world.tensions) || world.tensions.length !== 3) warnings.push('Exactly three tensions are expected.');

  return warnings;
}
