// =========================================
// engine/worldgen.js — structured world generation, no AI calls.
//
// This is Layer 1 of the two-layer architecture: pure, fast, free,
// auditable. Walks a theme's milestone pool with MilestoneSelector,
// sampling one branch_alternative at every branch point, and records
// the full chosen path as a structured "world" object. Run this
// hundreds of times with different seeds to get a Monte Carlo batch;
// render-verbal.js (Layer 2) turns any one world into prose.
// =========================================

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MilestoneSelector, makeRng } from './selector.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT  = join(__dirname, '..', 'data', 'worlds');

function buildStep(theme, milestone, chosenAlternative) {
  const categoryField = theme.config.categoryField || 'category';
  return {
    milestoneId:      milestone.id,
    date:             milestone.date,
    label:            milestone.label,
    category:         milestone[categoryField] || null,
    lineage:          milestone.lineage || null,
    description:      milestone.description,
    isBranchPoint:    !!milestone.is_branch_point,
    eraConstraints:   milestone.era_constraints || null,
    chosenAlternative: chosenAlternative
      ? {
          id:          chosenAlternative.id,
          description: chosenAlternative.description,
          plausibility: chosenAlternative.plausibility || null,
          requirement: chosenAlternative.requirement || null,
          downstreamEffects: chosenAlternative.downstream_effects || []
        }
      : null
  };
}

/**
 * Generate one structured world from a theme, given a numeric seed.
 * @param {{id:string, config:object, milestones:object[], framework:object|null}} theme
 * @param {number} seed
 */
export function generateWorld(theme, seed) {
  const rng      = makeRng(seed);
  const selector = new MilestoneSelector(theme.config, theme.milestones, rng);

  const startId = theme.config.startMilestoneId;
  const start   = selector.getById(startId);
  if (!start) {
    throw new Error(`startMilestoneId "${startId}" not found in theme "${theme.id}" milestones`);
  }

  const steps = [];
  const firstAlt = selector.visit(startId, /* skipTrajectory */ true);
  steps.push(buildStep(theme, start, firstAlt));

  const stepsPerWorld = theme.config.stepsPerWorld || 6;
  let current = start;

  for (let i = 1; i < stepsPerWorld; i++) {
    const next = selector.selectNext(current.id);
    if (!next) break; // pool exhausted — world ends early, that's fine and worth noting
    const chosenAlt = selector.visit(next.id);
    steps.push(buildStep(theme, next, chosenAlt));
    current = next;
  }

  const last = steps[steps.length - 1];

  return {
    worldId:   `${theme.id}-${String(seed).padStart(4, '0')}`,
    themeId:   theme.id,
    seed,
    createdAt: new Date().toISOString(),
    steps,
    trajectory:            selector.trajectory,
    trajectoryDescription: selector.describeTrajectory(),
    terminalProfile: {
      milestoneId: last.milestoneId,
      label:       last.label,
      date:        last.date
    }
  };
}

/**
 * Generate a batch of N worlds, seeds startSeed..startSeed+n-1.
 */
export function generateWorldBatch(theme, n, startSeed = 1) {
  const worlds = [];
  for (let s = startSeed; s < startSeed + n; s++) {
    worlds.push(generateWorld(theme, s));
  }
  return worlds;
}

// --- Persistence ---

export function saveWorld(world) {
  const dir = join(DATA_ROOT, world.themeId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${world.worldId}.json`);
  writeFileSync(path, JSON.stringify(world, null, 2), 'utf8');
  return path;
}

export function listWorlds(themeId) {
  const dir = join(DATA_ROOT, themeId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export function loadWorld(themeId, worldId) {
  const path = join(DATA_ROOT, themeId, `${worldId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Deletes every generated world for a theme. Leaves .gitkeep alone so the
// folder structure survives in git. Returns the number of worlds deleted.
export function clearWorlds(themeId) {
  const dir = join(DATA_ROOT, themeId);
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  files.forEach(f => unlinkSync(join(dir, f)));
  return files.length;
}
