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

// See _score() for what this tunes. Theme-overridable via worldgen.timeDecayWeight.
const DEFAULT_TIME_DECAY_WEIGHT = 6;

// See selectNext() for what this tunes. Theme-overridable via
// worldgen.rankWeightExponent. Tested 1 (linear), 2, and 3 against 100 seeds
// of vr-immersion: 2 gave a meaningfully tighter max-year-jump distribution
// than 1 (avg worst-case jump per world 94y -> 88y, p90 unchanged, absolute
// worst case 163y -> 133y) with no measurable diversity cost (95/100 unique
// chains either way); 3 barely improved jumps further but did cost
// diversity (86/100 unique chains, fewer unique endings). 2 was the best
// tradeoff in that test, not a universal constant — worth re-checking if a
// theme's diversity report looks off after changing its milestone pool.
const DEFAULT_RANK_WEIGHT_EXPONENT = 2;

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

    // This theme's typical years-per-step pace, used by _score's time-decay
    // penalty (see there for why it exists). Computed from the milestone
    // pool's actual date span rather than hardcoded, so adding a theme never
    // requires tuning this by hand.
    const years = milestones.map(m => this._parseYear(m.date)).filter(y => y > 0);
    const stepsPerWorld = theme.stepsPerWorld || 6;
    this.expectedYearsPerStep = years.length > 1
      ? (Math.max(...years) - Math.min(...years)) / Math.max(1, stepsPerWorld - 1)
      : 1;
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
  // currentYear is needed for the time-decay term below: without it, this
  // was a pure trajectory-vector dot product with zero notion of how far
  // in time a candidate sits from the current milestone. That let a
  // strongly-reinforcing cluster of milestones (e.g. vr-immersion's
  // 2012-2024 consumer-VR run, which all push the same direction on every
  // axis) dominate scoring over decades of temporally-closer, more modestly
  // aligned candidates — because the cumulative trajectory vector grows
  // with each step and nothing capped how much a large alignment could
  // outweigh proximity. Symptom: worlds jumping straight from an 1860s
  // milestone to 2012 or 2024, skipping the 19th/early-20th-century pool
  // almost entirely.
  _score(milestone, currentYear) {
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

    // Free within one "expected step" span (this theme's date range divided
    // by its stepsPerWorld) — no penalty for normal pacing. Beyond that,
    // penalty grows linearly with how many step-spans the jump represents,
    // so a candidate has to be genuinely, strongly better-aligned (not just
    // marginally) to justify skipping multiple decades. timeDecayWeight is
    // theme-tunable via worldgen config; DEFAULT_TIME_DECAY_WEIGHT was
    // picked so a ~150-year jump roughly cancels a dot product in the
    // 25-30 range, which is what pulled worlds toward vr-immersion's 2012+
    // cluster in practice.
    const yearsGap = Math.max(0, this._parseYear(milestone.date) - currentYear);
    const pace = this.expectedYearsPerStep || 1;
    const excessSteps = Math.max(0, yearsGap / pace - 1);
    const timeDecayWeight = this.theme.worldgen?.timeDecayWeight ?? DEFAULT_TIME_DECAY_WEIGHT;
    const timePenalty = timeDecayWeight * excessSteps;

    return dot + crossBonus + branchBonus - timePenalty;
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
  //     among them stochastically (weighted by rank so the strongest
  //     candidates are more likely but not guaranteed — this is the
  //     source of run-to-run diversity across a Monte Carlo batch). ---
  selectNext(currentMilestoneId) {
    const pool = this._pool(currentMilestoneId);
    if (pool.length === 0) return null;

    const currentYear = this._parseYear(this.getById(currentMilestoneId)?.date);
    const topN = this.theme.worldgen?.topN ?? 3;
    const scored = pool
      .map(m => ({ milestone: m, score: this._score(m, currentYear) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(topN, pool.length));

    // Weighted by rank within the shortlist, not a uniform pick among it.
    // Rank (not raw score) because score's scale varies wildly step to step
    // as the trajectory vector accumulates, so it can't be turned into a
    // stable weight directly without per-theme tuning. This used to be a
    // uniform draw, which meant the _score time-decay penalty only ever
    // affected whether a distant candidate made the topN shortlist, not
    // its odds once there — a candidate ranked last of 6 was exactly as
    // likely to be picked as the top-ranked one, so a strongly-penalized
    // but still-shortlisted distant milestone could win just as often as
    // the nearby favorite. Rank-weighting (best of N candidates gets the
    // largest weight, worst gets the smallest, exponent below controls the
    // spread) keeps every shortlisted candidate reachable but lets the
    // ranking the penalty produced actually matter.
    const rankExponent = this.theme.worldgen?.rankWeightExponent ?? DEFAULT_RANK_WEIGHT_EXPONENT;
    const weights = scored.map((_, i) => Math.pow(scored.length - i, rankExponent));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.rng() * total;
    for (let i = 0; i < scored.length; i++) {
      r -= weights[i];
      if (r <= 0) return scored[i].milestone;
    }
    return scored[scored.length - 1].milestone;
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
