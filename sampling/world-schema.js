export const WORLD_SCHEMA_VERSION = 'alternate-present.v1';
export const GENERATION_PROMPT_VERSION = 'alternate-present-v3';

const stringArray = description => ({
  type: 'array',
  description,
  items: { type: 'string' }
});

const presentSection = description => stringArray(
  `${description} Supply two or three compact factual phrases about the endpoint only; do not repeat timeline developments.`
);

export const GENERATED_WORLD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    horizonYear: {
      type: 'integer',
      description: 'The endpoint year requested or inferred from the scenario brief; use the current year when the brief says present without naming a year.'
    },
    title: { type: 'string', description: 'A short, distinctive title for this alternate present.' },
    summary: { type: 'string', description: 'One sentence stating the central difference of this world.' },
    premise: {
      type: 'object',
      additionalProperties: false,
      properties: {
        divergence: {
          type: 'object',
          additionalProperties: false,
          properties: {
            year: { type: 'integer', description: 'Taken from or carefully inferred from the scenario brief.' },
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
    timeline: {
      type: 'array',
      description: 'Eight to ten chronological developments connecting the divergence to the endpoint.',
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
    present: {
      type: 'object',
      additionalProperties: false,
      properties: {
        technicalSystem: presentSection('What the mature technology is, how it works, and the infrastructure or standards beneath it.'),
        entertainment: presentSection('The dominant entertainment forms, practices, and creative institutions.'),
        socialMedia: presentSection('How communication, identity, attention, status, and communities operate.'),
        institutionsAndEconomy: presentSection('Important companies, public institutions, ownership patterns, standards, and business models.'),
        accessAndConflict: presentSection('Costs, exclusions, regulation, inequalities, resistance, failures, and unresolved conflicts.')
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
  required: ['horizonYear', 'title', 'summary', 'premise', 'assumptions', 'timeline', 'present', 'continuities', 'tensions']
};

export function validateGeneratedWorld(world, corpus) {
  const errors = [];
  if (!world || typeof world !== 'object') return ['Output is not an object.'];

  const eventIds = new Set(corpus.events.map(event => event.id));
  const anchor = world.premise?.divergence?.historicalAnchor;
  if (anchor && !eventIds.has(anchor)) errors.push(`historicalAnchor references unknown corpus event: ${anchor}`);

  if (!Number.isInteger(world.horizonYear)) errors.push('horizonYear must be an integer.');
  if (!Number.isInteger(world.premise?.divergence?.year)) errors.push('premise.divergence.year must be an integer.');
  if (world.premise?.divergence?.year > world.horizonYear) errors.push('The divergence cannot occur after the horizon year.');

  if (!Array.isArray(world.assumptions) || world.assumptions.length < 3 || world.assumptions.length > 4) {
    errors.push('Three or four enabling assumptions are required.');
  }
  if (!Array.isArray(world.timeline) || world.timeline.length < 8 || world.timeline.length > 10) {
    errors.push('Eight to ten timeline developments are required.');
  }

  const knownCauses = new Set();
  for (const assumption of world.assumptions || []) {
    if (knownCauses.has(assumption.id)) errors.push(`Duplicate id: ${assumption.id}`);
    knownCauses.add(assumption.id);
  }

  let priorYear = -Infinity;
  for (const event of world.timeline || []) {
    if (knownCauses.has(event.id)) errors.push(`Duplicate id: ${event.id}`);
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

  for (const [key, values] of Object.entries(world.present || {})) {
    if (!Array.isArray(values) || values.length < 2 || values.length > 3) {
      errors.push(`present.${key} must contain two or three statements.`);
    }
  }
  if (!Array.isArray(world.continuities) || world.continuities.length !== 3) errors.push('Exactly three continuities are required.');
  if (!Array.isArray(world.tensions) || world.tensions.length !== 3) errors.push('Exactly three tensions are required.');

  return errors;
}
