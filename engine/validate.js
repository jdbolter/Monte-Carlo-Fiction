// =========================================
// engine/validate.js — Phase 4 quality checks on a batch of worlds.
//
// Cheap, deterministic, no AI calls. Run this after generating a batch
// and before spending money rendering prose, to catch path collapse,
// narrow milestone coverage, and convergence on one final milestone.
// =========================================

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function variance(nums) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return mean(nums.map(n => (n - m) ** 2));
}

export function diversityReport(worlds, axes = [], theme = null) {
  const total = worlds.length;
  if (total === 0) {
    return { total: 0, message: 'No worlds to analyze.' };
  }

  // --- Unique path ratio ---
  // Legacy reports retain milestone-only chains. Causal worlds include the
  // explicit outcome at each event, because two worlds can traverse the same
  // events while reaching materially different states.
  const milestoneChainKeys = worlds.map(w => w.steps.map(s => s.milestoneId).join('>'));
  const outcomePathKeys = worlds.map(w => w.steps.map(s =>
    `${s.milestoneId}::${s.chosenOutcome?.id || s.chosenAlternative?.id || 'canonical'}`
  ).join('>'));
  const isCausal = worlds.some(world => world.schemaVersion === 2);
  const uniqueMilestoneChains = new Set(milestoneChainKeys).size;
  const uniqueOutcomePaths = new Set(outcomePathKeys).size;
  const uniqueChains = isCausal ? uniqueOutcomePaths : uniqueMilestoneChains;

  // --- Milestone-pool coverage ---
  // "Milestone" is the shared report term: schema-v2 themes call their
  // source records events, but generated steps retain milestoneId for
  // renderer compatibility. Fall back to the sampled set when no theme was
  // supplied so diversityReport remains useful as a standalone helper.
  const configuredMilestones = isCausal ? (theme?.events || []) : (theme?.milestones || []);
  const configuredMilestoneIds = new Set(configuredMilestones.map(item => item.id));
  const sampledMilestoneIds = new Set(worlds.flatMap(world => world.steps.map(step => step.milestoneId)));
  const milestoneTotal = configuredMilestoneIds.size || sampledMilestoneIds.size;
  const unsampledMilestoneIds = [...configuredMilestoneIds].filter(id => !sampledMilestoneIds.has(id));
  const milestoneCoverage = {
    sampled: sampledMilestoneIds.size,
    total: milestoneTotal,
    ratio: milestoneTotal ? sampledMilestoneIds.size / milestoneTotal : 0,
    unsampledMilestoneIds
  };

  // --- Final-milestone convergence ---
  // This deliberately ignores the chosen outcome and accumulated causal
  // state. It answers the literal UI question: which named milestone do
  // these worlds end on, and how many worlds end there?
  const finalMilestonesById = new Map();
  for (const world of worlds) {
    const last = world.steps.at(-1);
    if (!last) continue;
    const existing = finalMilestonesById.get(last.milestoneId);
    if (existing) existing.count += 1;
    else {
      finalMilestonesById.set(last.milestoneId, {
        milestoneId: last.milestoneId,
        label: last.label || last.milestoneId,
        count: 1
      });
    }
  }
  const finalMilestoneDistribution = [...finalMilestonesById.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const mostCommonFinalMilestone = finalMilestoneDistribution[0] || null;

  // --- Branch alternative choice distribution ---
  const branchChoices = {}; // milestoneId -> { alternativeId: count }
  worlds.forEach(w => {
    w.steps.forEach(s => {
      if (s.isBranchPoint) {
        const key = s.milestoneId;
        branchChoices[key] = branchChoices[key] || {};
        const altId = s.chosenOutcome?.id || s.chosenAlternative?.id || '(canonical / no alternative)';
        branchChoices[key][altId] = (branchChoices[key][altId] || 0) + 1;
      }
    });
  });

  // --- Trajectory axis stats ---
  const axisStats = {};
  for (const axis of axes) {
    const values = worlds.map(w => w.trajectory[axis] || 0);
    axisStats[axis] = { mean: mean(values), variance: variance(values), min: Math.min(...values), max: Math.max(...values) };
  }

  const report = {
    total,
    uniqueMilestoneChains,
    uniqueOutcomePaths,
    chainDiversityRatio: uniqueChains / total,
    milestoneCoverage,
    mostCommonFinalMilestone,
    finalMilestoneDistribution,
    branchChoices,
    axisStats,
    flags: [
      chainDiversityFlag(uniqueChains, total)
    ].filter(Boolean)
  };

  if (isCausal) report.causalDiagnostics = causalBatchDiagnostics(worlds, theme);
  return report;
}

function causalBatchDiagnostics(worlds, theme) {
  const eventCounts = {};
  const outcomeCounts = {};
  const divergenceCountDistribution = {};
  const firstDivergenceDateDistribution = {};
  const terminalStateCounts = {};

  for (const world of worlds) {
    const divergenceCount = world.generation?.divergenceCount ?? 0;
    divergenceCountDistribution[divergenceCount] = (divergenceCountDistribution[divergenceCount] || 0) + 1;
    const firstDivergence = world.steps.find(step => step.isBranchPoint && step.chosenOutcome && !step.chosenOutcome.canonical);
    const divergenceDate = firstDivergence?.occurredAt || '(none)';
    firstDivergenceDateDistribution[divergenceDate] = (firstDivergenceDateDistribution[divergenceDate] || 0) + 1;

    for (const step of world.steps) {
      eventCounts[step.eventId] = (eventCounts[step.eventId] || 0) + 1;
      if (step.chosenOutcome) {
        outcomeCounts[step.eventId] = outcomeCounts[step.eventId] || {};
        outcomeCounts[step.eventId][step.chosenOutcome.id] =
          (outcomeCounts[step.eventId][step.chosenOutcome.id] || 0) + 1;
      }
    }
    const terminalKey = JSON.stringify(world.terminalState || {});
    terminalStateCounts[terminalKey] = (terminalStateCounts[terminalKey] || 0) + 1;
  }

  const configuredEvents = theme?.events || [];
  const unsampledEvents = configuredEvents
    .filter(event => !eventCounts[event.id])
    .map(event => event.id);
  const unsampledOutcomes = configuredEvents.flatMap(event =>
    (event.outcomes || [])
      .filter(outcome => !outcomeCounts[event.id]?.[outcome.id])
      .map(outcome => `${event.id}::${outcome.id}`)
  );

  return {
    eventCounts,
    outcomeCounts,
    unsampledEvents,
    unsampledOutcomes,
    divergenceCountDistribution,
    firstDivergenceDateDistribution,
    uniqueTerminalStates: Object.keys(terminalStateCounts).length,
    terminalStateCounts
  };
}

function chainDiversityFlag(uniqueChains, total) {
  const ratio = uniqueChains / total;
  if (ratio < 0.7) {
    return `Low chain diversity (${(ratio * 100).toFixed(0)}% unique). Consider increasing branch density, topN, or adding more milestones.`;
  }
  return null;
}
