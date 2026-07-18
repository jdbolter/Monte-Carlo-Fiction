// =========================================
// sampling/world.js — the unified world model.
//
// One world model, two ingredients:
//   1. changed dimensions  (from sampling the dimension table)
//   2. event backstory     (real events selected because they ground the changes)
//
// makeWorld() marries them into the single World object that every renderer will
// consume. No model calls here — world generation is free and deterministic.
// (Rendering a World into an artifact is a separate, later step.)
//
// World shape — see WORLD-CONTRACT.md:
//   { id, domain, seed, createdAt, provenance,
//     dimensions:{ all, changed:[{dimension,label,value,ground,exclusive,gloss,worldFact}], k },
//     facts:[ <string> ],                       // changed moves as plain sentences
//     backstory:{ events:[...], brief:<string> },
//     summary:<string> }
// =========================================

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadDimensions, sampleBatch } from './sampler.js';
import { selectBackstory, assembleBrief, loadAllEvents } from './backstory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = join(__dirname, 'worlds');
const DOMAIN = 'media-present';

function worldId(config, dims) {
  const changed = dims.filter(d => config[d.id] !== d.ground);
  const key = changed.map(d => `${d.id}:${config[d.id]}`).sort().join('|');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `w-k${changed.length}-${h.toString(36)}`;
}

function changedMoves(config, dims) {
  return dims
    .filter(d => config[d.id] !== d.ground)
    .map(d => ({
      dimension: d.id,
      label: d.label,
      value: config[d.id],
      ground: d.ground,
      exclusive: !!d.exclusive,
      gloss: (d.glosses && d.glosses[config[d.id]]) || null,
      worldFact: (d.worldFacts && d.worldFacts[config[d.id]]) ||
        `On ${d.label.toLowerCase()}, this world is "${config[d.id]}" rather than "${d.ground}".`
    }));
}

/**
 * Build a World from a configuration.
 * @param {object} config  { dimId: value } — the changed present
 * @param {object[]} dims  loadDimensions()
 * @param {object} opts    { events?, backstory?, backstoryN?, seed?, direction? }
 */
export function makeWorld(config, dims, opts = {}) {
  const changed = changedMoves(config, dims);
  const facts = changed.map(c => c.worldFact);
  const events = opts.events ?? loadAllEvents();
  const selection = opts.backstory ?? selectBackstory(config, dims, { events, n: opts.backstoryN ?? 6 });
  const brief = assembleBrief(selection);

  return {
    id: worldId(config, dims),
    domain: DOMAIN,
    seed: opts.seed ?? null,
    createdAt: new Date().toISOString(),
    provenance: { direction: opts.direction ?? 'sampled' },
    dimensions: { all: { ...config }, changed, k: changed.length },
    facts,
    backstory: { events: selection.events, brief },
    summary: changed.length
      ? `A media present in which ${changed.map(c => `${c.label.toLowerCase()} is ${c.value}`).join('; ')}.`
      : 'Our present (no dimensions changed).'
  };
}

// Sample a batch and build a World for each. Reproducible from seed.
export function generateWorlds({ kSpec = 2, n = 3, seed = 1, dims, events } = {}) {
  dims = dims ?? loadDimensions();
  events = events ?? loadAllEvents();
  return sampleBatch({ dims, kSpec, n, baseSeed: seed })
    .map(s => makeWorld(s.config, dims, { events, seed: s.seed }));
}

export function saveWorld(world) {
  mkdirSync(WORLD_DIR, { recursive: true });
  const p = join(WORLD_DIR, `${world.id}.json`);
  writeFileSync(p, JSON.stringify(world, null, 2), 'utf8');
  return p;
}

export function listWorlds() {
  if (!existsSync(WORLD_DIR)) return [];
  return readdirSync(WORLD_DIR).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(WORLD_DIR, f), 'utf8')));
}

// Delete all saved generated Worlds. Returns the count removed.
export function clearWorlds() {
  if (!existsSync(WORLD_DIR)) return 0;
  const files = readdirSync(WORLD_DIR).filter(f => f.endsWith('.json'));
  let n = 0;
  for (const f of files) { try { unlinkSync(join(WORLD_DIR, f)); n++; } catch {} }
  return n;
}

// --- CLI: node sampling/world.js [--k N | --k-range LO HI] [--n B] [--seed S] [--save] ---
function readable(w) {
  const lines = [];
  lines.push(`# ${w.id}   (k=${w.dimensions.k}, ${w.provenance.direction})`);
  lines.push(w.summary);
  lines.push('');
  lines.push('WORLD-FACTS (the renderer must honor these):');
  w.facts.forEach(f => lines.push(`  • ${f}`));
  lines.push('');
  lines.push('BACKSTORY (real events that ground this present):');
  w.backstory.events.forEach(e => lines.push(`  ${e.display.padEnd(11)} ${e.label}  [${e.corpus}]`));
  return lines.join('\n');
}

function main(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k') a.k = +argv[++i];
    else if (argv[i] === '--k-range') { a.kLo = +argv[++i]; a.kHi = +argv[++i]; }
    else if (argv[i] === '--n') a.n = +argv[++i];
    else if (argv[i] === '--seed') a.seed = +argv[++i];
    else if (argv[i] === '--save') a.save = true;
  }
  const kSpec = a.kLo != null ? [a.kLo, a.kHi] : (a.k ?? 2);
  const worlds = generateWorlds({ kSpec, n: a.n ?? 3, seed: a.seed ?? 1 });
  const label = Array.isArray(kSpec) ? `k=${kSpec[0]}–${kSpec[1]}` : `k=${kSpec}`;
  console.log(`# world generation — ${worlds.length} worlds, ${label}, seed ${a.seed ?? 1}\n`);
  for (const w of worlds) {
    console.log(readable(w));
    if (a.save) console.log(`  saved → ${saveWorld(w)}`);
    console.log('\n' + '─'.repeat(72) + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
