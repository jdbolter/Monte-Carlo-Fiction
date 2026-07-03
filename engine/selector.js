// =========================================
// engine/selector.js — headless, theme-agnostic milestone selector
//
// Adapted from the VR_Speculation pastcasting selector.js. That version
// was written for a single live user walking one path with keyword-matched
// trajectory updates. This version:
//   - has no DOM / fetch dependency (pure JS, runs in Node)
//   - reads axis names and category field from the active theme's config
//     instead of hardcoding VR-specific axes
//   - takes an injectable RNG so batch runs are seed-reproducible
//   - resolves branch points by sampling one branch_alternative per visit
//     (the actual "Monte Carlo" step) instead of waiting for user text
// =========================================

// --- Deterministic RNG (mulberry32) so a given seed always reproduces
//     the same world. Swap in Math.random for pure randomness. ---
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MilestoneSelector {
  /**
   * @param {object} theme - loaded theme.config.json
   * @param {object[]} milestones - theme's milestones array
   * @param {function} rng - () => float in [0,1). Defaults to Math.random.
   */
  constructor(theme, milestones, rng = Math.random) {
    this.theme        = theme;
    this.axes         = theme.axes || [];              // e.g. ['sensory','interaction','institutional','scale']
    this.categoryField = theme.categoryField || 'category';
    this.allMilestones = milestones;
    this.rng          = rng;

    this.visited       = new Set();
    this.trajectory     = Object.fromEntries(this.axes.map(a => [a, 0]));
    this.lastCategory   = null;
    this.stepCount      = 0;
    this.chosenAlternatives = {}; // milestoneId -> chosen branch_alternative object (or null)
  }

  getById(id) {
    return this.allMilestones.find(m => m.id === id);
  }

  // --- Mark a milestone visited; fold its trajectory_contribution in.
  //     skipTrajectory=true is used for a fixed starting milestone so the
  //     trajectory stays at zero until the world has actually branched. ---
  visit(milestoneId, skipTrajectory = false) {
    this.visited.add(milestoneId);
    this.stepCount++;

    const m = this.getById(milestoneId);
    if (m && m.trajectory_contribution && !skipTrajectory) {
      for (const axis of this.axes) {
        this.trajectory[axis] += (m.trajectory_contribution[axis] || 0);
      }
    }
    this.lastCategory = m ? m[this.categoryField] : null;

    // Resolve a branch point: sample one alternative and lock it into the
    // world's record. Plausibility weights the sampling (high > medium > low).
    if (m && m.is_branch_point && m.branch_alternatives && m.branch_alternatives.length > 0) {
      this.chosenAlternatives[milestoneId] = this._sampleAlternative(m.branch_alternatives);
    } else {
      this.chosenAlternatives[milestoneId] = null;
    }

    return this.chosenAlternatives[milestoneId];
  }

  _sampleAlternative(alternatives) {
    const weight = { high: 3, medium: 2, 'low-medium': 1.5, low: 1 };
    const weights = alternatives.map(a => weight[a.plausibility] || 1);
    const total   = weights.reduce((s, w) => s + w, 0);
    let r = this.rng() * total;
    for (let i = 0; i < alternatives.length; i++) {
      r -= weights[i];
      if (r <= 0) return alternatives[i];
    }
    return alternatives[alternatives.length - 1];
  }

  _parseYear(dateStr) {
    if (!dateStr) return 0;
    const match = String(dateStr).match(/\d{4}/);
    return match ? parseInt(match[0], 10) : 0;
  }

  // --- Score a candidate against the accumulated trajectory ---
  _score(milestone) {
    const tc = milestone.trajectory_contribution || {};
    let dot = 0;
    for (const axis of this.axes) {
      dot += (this.trajectory[axis] || 0) * (tc[axis] || 0);
    }

    const crossBonusEvery = this.theme.worldgen?.crossCategoryBonusEvery ?? 3;
    const crossBonus = (crossBonusEvery > 0 && this.stepCount % crossBonusEvery === 0 &&
      milestone[this.categoryField] !== this.lastCategory) ? 1.5 : 0;

    const branchBonus = milestone.is_branch_point
      ? (this.theme.worldgen?.branchPointBonus ?? 1.0)
      : 0;

    return dot + crossBonus + branchBonus;
  }

  _pool(currentMilestoneId) {
    const current     = this.getById(currentMilestoneId);
    const currentYear  = this._parseYear(current ? current.date : '0');

    return this.allMilestones.filter(m => {
      if (this.visited.has(m.id))      return false;
      if (m.id === currentMilestoneId) return false;
      return this._parseYear(m.date) > currentYear;
    });
  }

  // --- Pick the next milestone: score the pool, take the top N, choose
  //     among them stochastically (weighted by score so the strongest
  //     candidates are more likely but not guaranteed — this is the
  //     source of run-to-run diversity across a Monte Carlo batch). ---
  selectNext(currentMilestoneId) {
    const pool = this._pool(currentMilestoneId);
    if (pool.length === 0) return null;

    const topN = this.theme.worldgen?.topN ?? 3;
    const scored = pool
      .map(m => ({ milestone: m, score: this._score(m) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(topN, pool.length));

    const idx = Math.floor(this.rng() * scored.length);
    return scored[idx].milestone;
  }

  describeTrajectory() {
    const tags = [];
    for (const axis of this.axes) {
      const v = this.trajectory[axis];
      if (v > 1) tags.push(`high ${axis}`);
      if (v < -1) tags.push(`low ${axis}`);
    }
    return tags.length ? tags.join(', ') : 'undetermined';
  }
}
