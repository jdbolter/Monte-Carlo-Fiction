export const ALTERNATIVE_PLAN_PROMPT_VERSION = 'alternative-routes-v1';

const stringArray = description => ({
  type: 'array',
  description,
  items: { type: 'string' }
});

export const ALTERNATIVE_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    alternatives: {
      type: 'array',
      description: 'Exactly the requested number of substantively distinct causal routes.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: 'Short unique route id, preferably route-1, route-2, and so on.'
          },
          causalThesis: {
            type: 'string',
            description: 'Compact statement of the route’s distinctive causal interpretation of the stipulated divergence.'
          },
          decisiveMechanisms: stringArray(
            'Two to four compact mechanisms that distinguish this route, such as actor responses, institutional choices, material constraints, coalitions, resistance, or second-order shocks.'
          ),
          eventsToTransform: stringArray(
            'One to six exact event ids from the supplied corpus that this route will especially retain, alter, displace, accelerate, delay, or prevent.'
          ),
          expectedEndpointDifference: {
            type: 'string',
            description: 'Compact statement of how this route’s ending-year settlement should differ from the other alternatives.'
          }
        },
        required: ['id', 'causalThesis', 'decisiveMechanisms', 'eventsToTransform', 'expectedEndpointDifference']
      }
    }
  },
  required: ['alternatives']
};

export function buildAlternativePlanRequest({ corpusSource, input, count, model, systemPrompt }) {
  return {
    model,
    max_tokens: 5000,
    thinking: { type: 'disabled' },
    system: systemPrompt,
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
          text: `ALTERNATIVE PLANNING INPUT\n${JSON.stringify({ ...input, alternativeCount: count }, null, 2)}\n\nDesign exactly ${count} substantively distinct causal routes.`
        }
      ]
    }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: ALTERNATIVE_PLAN_SCHEMA
      }
    }
  };
}

export function validateAlternativePlan(plan, corpus, expectedCount) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['Alternative plan is not an object.'];
  if (!Array.isArray(plan.alternatives) || plan.alternatives.length !== expectedCount) {
    errors.push(`Exactly ${expectedCount} alternative routes are required.`);
  }

  const routeIds = new Set();
  const eventIds = new Set(corpus.events.map(event => event.id));
  for (const [index, route] of (plan.alternatives || []).entries()) {
    const at = `alternatives[${index}]`;
    if (!route?.id || routeIds.has(route.id)) errors.push(`${at}.id must be non-empty and unique.`);
    routeIds.add(route?.id);
    if (!route?.causalThesis?.trim()) errors.push(`${at}.causalThesis is required.`);
    if (!Array.isArray(route?.decisiveMechanisms) || route.decisiveMechanisms.length < 2 || route.decisiveMechanisms.length > 4) {
      errors.push(`${at}.decisiveMechanisms must contain two to four mechanisms.`);
    }
    if (!Array.isArray(route?.eventsToTransform) || route.eventsToTransform.length < 1 || route.eventsToTransform.length > 6) {
      errors.push(`${at}.eventsToTransform must contain one to six corpus event ids.`);
    }
    for (const ref of route?.eventsToTransform || []) {
      if (!eventIds.has(ref)) errors.push(`${at}.eventsToTransform references unknown corpus event: ${ref}`);
    }
    if (!route?.expectedEndpointDifference?.trim()) errors.push(`${at}.expectedEndpointDifference is required.`);
  }
  return errors;
}
