// =========================================
// engine/validate.js — Phase 4 quality checks on a batch of worlds.
//
// Cheap, deterministic, no AI calls. Run this after generating a batch
// and before spending money rendering prose, to catch path collapse
// (Phase 3/4 risk in MONTE_CARLO_STRATEGY.md: too many worlds
// converging on the same ending).
// =========================================

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function variance(nums) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return mean(nums.map(n => (n - m) ** 2));
}

export function diversityReport(worlds, axes = []) {
  const total = worlds.length;
  if (total === 0) {
    return { total: 0, message: 'No worlds to analyze.' };
  }

  // --- Unique milestone-chain ratio ---
  const chainKeys = worlds.map(w => w.steps.map(s => s.milestoneId).join('>'));
  const uniqueChains = new Set(chainKeys).size;

  // --- Terminal diversity ---
  // Keyed by milestoneId + chosenAlternative.id (when the terminal step is a
  // branch point) so two worlds that reach the same milestone but diverge
  // into different branch alternatives count as different endings.
  const terminalKeys = worlds.map(w => {
    const last = w.steps[w.steps.length - 1];
    return last.chosenAlternative ? `${last.milestoneId}::${last.chosenAlternative.id}` : last.milestoneId;
  });
  const uniqueTerminals = new Set(terminalKeys).size;
  const terminalCounts = {};
  terminalKeys.forEach(k => { terminalCounts[k] = (terminalCounts[k] || 0) + 1; });
  const repeatedEndingRate = 1 - (uniqueTerminals / total);

  // --- Branch alternative choice distribution ---
  const branchChoices = {}; // milestoneId -> { alternativeId: count }
  worlds.forEach(w => {
    w.steps.forEach(s => {
      if (s.isBranchPoint) {
        const key = s.milestoneId;
        branchChoices[key] = branchChoices[key] || {};
        const altId = s.chosenAlternative ? s.chosenAlternative.id : '(no alternatives defined)';
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

  return {
    total,
    uniqueMilestoneChains: uniqueChains,
    chainDiversityRatio: uniqueChains / total,
    uniqueTerminals,
    repeatedEndingRate,
    terminalCounts,
    branchChoices,
    axisStats,
    flags: [
      chainDiversityFlag(uniqueChains, total),
      repeatedEndingFlag(repeatedEndingRate)
    ].filter(Boolean)
  };
}

function chainDiversityFlag(uniqueChains, total) {
  const ratio = uniqueChains / total;
  if (ratio < 0.7) {
    return `Low chain diversity (${(ratio * 100).toFixed(0)}% unique). Consider increasing branch density, topN, or adding more milestones.`;
  }
  return null;
}

function repeatedEndingFlag(rate) {
  if (rate > 0.5) {
    return `High repeated-ending rate (${(rate * 100).toFixed(0)}%). Many worlds converge on the same terminal milestone — consider more branch points near the end of the timeline.`;
  }
  return null;
}
