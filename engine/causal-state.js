// =========================================
// engine/causal-state.js — shared state operations for schema-v2 themes.
//
// This module is deterministic and side-effect free except for the explicit
// state mutations in applyCausalEffects / expireEvents. It knows nothing about
// rendering or persistence.
// =========================================

export function parseIsoDate(value) {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new Error(`Invalid ISO date: ${value}`);
  return time;
}

export function createInitialCausalState(registry, startDate) {
  return {
    facts: Object.fromEntries(
      Object.entries(registry.facts || {}).map(([key, definition]) => [key, definition.default])
    ),
    trajectory: Object.fromEntries(Object.keys(registry.axes || {}).map(axis => [axis, 0])),
    currentDate: startDate,
    occurred: new Set(),
    outcomes: new Map(),
    enabled: new Set(),
    disabled: new Set(),
    enabledBy: new Map(),
    expired: new Set(),
    influences: new Map()
  };
}

export function snapshotCausalState(state, registry) {
  const nonDefaultFacts = {};
  for (const [key, value] of Object.entries(state.facts)) {
    if (!Object.is(value, registry.facts[key]?.default)) nonDefaultFacts[key] = value;
  }
  return {
    facts: nonDefaultFacts,
    trajectory: { ...state.trajectory },
    enabledEvents: [...state.enabled].sort(),
    disabledEvents: [...state.disabled].sort()
  };
}

export function evaluateCondition(condition, state) {
  if (condition.kind === 'fact') {
    const actual = state.facts[condition.fact];
    switch (condition.operator) {
      case 'equals': return Object.is(actual, condition.value);
      case 'notEquals': return !Object.is(actual, condition.value);
      case 'in': return Array.isArray(condition.value) && condition.value.includes(actual);
      case 'greaterThanOrEqual': return actual >= condition.value;
      case 'lessThanOrEqual': return actual <= condition.value;
      default: return false;
    }
  }
  if (condition.kind === 'eventOccurred') {
    return state.occurred.has(condition.eventId);
  }
  if (condition.kind === 'outcomeChosen') {
    return state.outcomes.get(condition.eventId) === condition.outcomeId;
  }
  return false;
}

export function evaluateRequirements(requires, state) {
  if (!requires) return true;
  if ((requires.all || []).some(condition => !evaluateCondition(condition, state))) return false;
  if (requires.any?.length && !requires.any.some(condition => evaluateCondition(condition, state))) return false;
  if ((requires.none || []).some(condition => evaluateCondition(condition, state))) return false;
  return true;
}

export function mergeEffects(commonEffects = {}, outcomeEffects = {}) {
  const sets = { ...(commonEffects.sets || {}), ...(outcomeEffects.sets || {}) };
  const trajectoryDelta = {};
  const axes = new Set([
    ...Object.keys(commonEffects.trajectoryDelta || {}),
    ...Object.keys(outcomeEffects.trajectoryDelta || {})
  ]);
  for (const axis of axes) {
    trajectoryDelta[axis] = (commonEffects.trajectoryDelta?.[axis] || 0) +
      (outcomeEffects.trajectoryDelta?.[axis] || 0);
  }

  const effects = {};
  if (Object.keys(sets).length) effects.sets = sets;
  if (Object.keys(trajectoryDelta).length) effects.trajectoryDelta = trajectoryDelta;

  const enables = [...new Set([...(commonEffects.enables || []), ...(outcomeEffects.enables || [])])];
  const disables = [...new Set([...(commonEffects.disables || []), ...(outcomeEffects.disables || [])])];
  const influences = [...(commonEffects.influences || []), ...(outcomeEffects.influences || [])];
  if (enables.length) effects.enables = enables;
  if (disables.length) effects.disables = disables;
  if (influences.length) effects.influences = influences.map(influence => ({ ...influence }));
  return effects;
}

export function applyCausalEffects(state, effects, source = null) {
  for (const [key, value] of Object.entries(effects.sets || {})) {
    state.facts[key] = value;
  }
  for (const [axis, delta] of Object.entries(effects.trajectoryDelta || {})) {
    state.trajectory[axis] = (state.trajectory[axis] || 0) + delta;
  }
  for (const eventId of effects.enables || []) {
    state.disabled.delete(eventId);
    state.enabled.add(eventId);
    if (source) state.enabledBy.set(eventId, { ...source });
  }
  for (const eventId of effects.disables || []) {
    state.enabled.delete(eventId);
    state.enabledBy.delete(eventId);
    state.disabled.add(eventId);
  }
  for (const influence of effects.influences || []) {
    const previous = state.influences.get(influence.eventId) ?? 1;
    state.influences.set(influence.eventId, previous * influence.weightMultiplier);
  }
}

export function expireEvents(state, events, asOfDate) {
  const newlyExpired = [];
  for (const event of events) {
    if (state.occurred.has(event.id) || state.expired.has(event.id)) continue;
    if (parseIsoDate(event.time.latest) < parseIsoDate(asOfDate)) {
      state.expired.add(event.id);
      state.enabled.delete(event.id);
      state.enabledBy.delete(event.id);
      newlyExpired.push(event.id);
    }
  }
  return newlyExpired.sort();
}

export function isRegisteredFactValue(registry, key, value) {
  const definition = registry.facts?.[key];
  if (!definition) return false;
  if (definition.type === 'boolean') return typeof value === 'boolean';
  if (definition.type === 'enum') return definition.values.includes(value);
  if (definition.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) &&
      value >= definition.minimum && value <= definition.maximum;
  }
  return false;
}
