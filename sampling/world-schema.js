export const WORLD_SCHEMA_VERSION = 'alternate-history.v1';
export const LEGACY_WORLD_SCHEMA_VERSION = 'alternate-present.v1';
export const GENERATION_PROMPT_VERSION = 'alternate-history-v1';

const stringArray = description => ({
  type: 'array',
  description,
  items: { type: 'string' }
});

const endpointSection = description => stringArray(
  `${description} Prefer two or three compact factual phrases about the endpoint only; use a fourth only when needed for a distinct fact. Do not repeat timeline developments.`
);

const historicalForces = {
  type: 'array',
  description: 'Exactly four compact interpretations of how actual history continues to enable, constrain, or redirect this alternate world.',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sourceRefs: stringArray('One or more exact ids from the supplied history corpus supporting this force.'),
      legacy: { type: 'string', description: 'Compact phrase naming the inherited capability, institution, business pattern, cultural practice, or remembered failure.' },
      effect: { type: 'string', description: 'Compact phrase stating how that inheritance enables, constrains, or redirects the alternate trajectory or endpoint.' }
    },
    required: ['sourceRefs', 'legacy', 'effect']
  }
};

export const GENERATED_WORLD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    startYear: {
      type: 'integer',
      description: 'The user-supplied year in which the divergence and alternate trajectory begin.'
    },
    horizonYear: {
      type: 'integer',
      description: 'The user-supplied ending year. It may be before, during, or after the actual present.'
    },
    title: { type: 'string', description: 'A short, distinctive title for this alternate history.' },
    summary: { type: 'string', description: 'One sentence stating the central difference of this world.' },
    premise: {
      type: 'object',
      additionalProperties: false,
      properties: {
        divergence: {
          type: 'object',
          additionalProperties: false,
          properties: {
            year: { type: 'integer', description: 'Copy startYear exactly.' },
            historicalAnchor: {
              type: ['string', 'null'],
              description: 'An exact event id from the supplied corpus when one clearly anchors the divergence; otherwise null.'
            },
            change: { type: 'string', description: 'A faithful, concise restatement of the stipulated divergence.' }
          },
          required: ['year', 'historicalAnchor', 'change']
        },
        targetCondition: {
          type: ['string', 'null'],
          description: 'The requested endpoint condition, or null when the endpoint is meant to emerge from the divergence.'
        },
        scope: stringArray('The domains the scenario asks this world to emphasize.')
      },
      required: ['divergence', 'targetCondition', 'scope']
    },
    assumptions: {
      type: 'array',
      description: 'Three or four enabling changes needed to make the stipulated divergence and trajectory coherent.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Short unique id such as a1.' },
          claim: { type: 'string', description: 'Compact phrase naming the supporting technical, economic, institutional, or social change.' },
          timing: { type: 'string', description: 'When this condition must hold, expressed briefly, for example by 1990 or during the early 2000s.' },
          plausibility: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['id', 'claim', 'timing', 'plausibility']
      }
    },
    historicalForces,
    timeline: {
      type: 'array',
      description: 'Exactly nine chronological developments connecting the divergence to the endpoint.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Short unique id such as e1.' },
          year: { type: 'integer' },
          development: { type: 'string', description: 'Compact factual phrase naming what happens; usually under 18 words.' },
          consequence: { type: 'string', description: 'Compact phrase naming what changes or becomes possible next; usually under 18 words.' },
          causedBy: stringArray('Ids of assumptions or earlier timeline developments that make this development possible.'),
          status: { type: 'string', enum: ['retained', 'altered', 'invented'] },
          sourceRefs: stringArray('Exact ids from the supplied history corpus that this development retains, alters, or builds upon; empty when none applies.')
        },
        required: ['id', 'year', 'development', 'consequence', 'causedBy', 'status', 'sourceRefs']
      }
    },
    endpoint: {
      type: 'object',
      additionalProperties: false,
      properties: {
        technicalSystem: endpointSection('What the mature technology is, how it works, and the infrastructure or standards beneath it.'),
        entertainment: endpointSection('The dominant entertainment forms, practices, and creative institutions.'),
        socialMedia: endpointSection('How communication, identity, attention, status, and communities operate.'),
        institutionsAndEconomy: endpointSection('Important companies, public institutions, ownership patterns, standards, and business models.'),
        accessAndConflict: endpointSection('Costs, exclusions, regulation, inequalities, resistance, failures, and unresolved conflicts.')
      },
      required: ['technicalSystem', 'entertainment', 'socialMedia', 'institutionsAndEconomy', 'accessAndConflict']
    },
    continuities: stringArray('Exactly three compact phrases naming important things from actual history that remain, including media or practices not displaced by the divergence.'),
    tensions: {
      type: 'array',
      description: 'Exactly three unresolved tensions that keep the world from becoming a simple utopia or dystopia.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          issue: { type: 'string' },
          description: { type: 'string', description: 'Compact phrase stating the opposed interests or unresolved pressure.' }
        },
        required: ['issue', 'description']
      }
    }
  },
  required: ['startYear', 'horizonYear', 'title', 'summary', 'premise', 'assumptions', 'historicalForces', 'timeline', 'endpoint', 'continuities', 'tensions']
};

export function validateGeneratedWorld(world, corpus, input = {}) {
  const errors = [];
  if (!world || typeof world !== 'object') return ['Output is not an object.'];

  const eventIds = new Set(corpus.events.map(event => event.id));
  const anchor = world.premise?.divergence?.historicalAnchor;
  if (anchor && !eventIds.has(anchor)) errors.push(`historicalAnchor references unknown corpus event: ${anchor}`);

  if (!Number.isInteger(world.startYear)) errors.push('startYear must be an integer.');
  if (!Number.isInteger(world.horizonYear)) errors.push('horizonYear must be an integer.');
  if (world.startYear >= world.horizonYear) errors.push('startYear must precede horizonYear.');
  if (Number.isInteger(input.startYear) && world.startYear !== input.startYear) errors.push(`startYear should be ${input.startYear}.`);
  if (Number.isInteger(input.endYear) && world.horizonYear !== input.endYear) errors.push(`horizonYear should be ${input.endYear}.`);
  if (!Number.isInteger(world.premise?.divergence?.year)) errors.push('premise.divergence.year must be an integer.');
  if (world.premise?.divergence?.year !== world.startYear) errors.push('The divergence year must equal startYear.');
  if (world.premise?.divergence?.year > world.horizonYear) errors.push('The divergence cannot occur after the horizon year.');

  if (!Array.isArray(world.assumptions) || world.assumptions.length < 3 || world.assumptions.length > 4) {
    errors.push('Three or four enabling assumptions are required.');
  }
  if (!Array.isArray(world.historicalForces) || world.historicalForces.length !== 4) {
    errors.push('Exactly four historical forces are required.');
  }
  for (const [index, force] of (world.historicalForces || []).entries()) {
    if (!Array.isArray(force.sourceRefs) || force.sourceRefs.length === 0) {
      errors.push(`historicalForces[${index}] must cite at least one corpus event.`);
    }
    for (const ref of force.sourceRefs || []) {
      if (!eventIds.has(ref)) errors.push(`historicalForces[${index}] references unknown corpus event: ${ref}`);
    }
  }
  if (!Array.isArray(world.timeline) || world.timeline.length !== 9) {
    errors.push('Exactly nine timeline developments are required.');
  }

  const knownCauses = new Set();
  for (const assumption of world.assumptions || []) {
    if (knownCauses.has(assumption.id)) errors.push(`Duplicate id: ${assumption.id}`);
    knownCauses.add(assumption.id);
  }

  let priorYear = -Infinity;
  for (const event of world.timeline || []) {
    if (knownCauses.has(event.id)) errors.push(`Duplicate id: ${event.id}`);
    if (event.year < world.startYear) errors.push(`${event.id} occurs before the starting year.`);
    if (event.year < priorYear) errors.push(`Timeline is not chronological at ${event.id}.`);
    if (event.year > world.horizonYear) errors.push(`${event.id} occurs after the horizon year.`);
    for (const cause of event.causedBy || []) {
      if (!knownCauses.has(cause)) errors.push(`${event.id} has unknown or non-prior cause: ${cause}`);
    }
    for (const ref of event.sourceRefs || []) {
      if (!eventIds.has(ref)) errors.push(`${event.id} references unknown corpus event: ${ref}`);
    }
    priorYear = event.year;
    knownCauses.add(event.id);
  }

  for (const [key, values] of Object.entries(world.endpoint || {})) {
    if (!Array.isArray(values) || values.length < 2 || values.length > 4) {
      errors.push(`endpoint.${key} must contain two to four phrases.`);
    }
  }
  if (!Array.isArray(world.continuities) || world.continuities.length !== 3) errors.push('Exactly three continuities are required.');
  if (!Array.isArray(world.tensions) || world.tensions.length !== 3) errors.push('Exactly three tensions are required.');

  return errors;
}
