// =========================================
// sampling/backstory.js — free, deterministic backstory selection.
//
// Given a sampled media-present configuration, pick real historical events
// (from history/vr.json + history/silicon-valley.json) whose themes resonate
// with the present's OFF-GROUND moves, and assemble them into a backstory brief.
//
// The idea: the real events are the SHARED PAST. A divergent present is grounded
// by the actual history that "rhymes" with its emphases — so the render has
// concrete historical texture to write from instead of an abstract configuration.
//
// No model calls. The dimension→tag map below is a provisional, hand-authored
// bridge (media-present dimensions ↔ the corpus tag vocabulary) and is meant to
// be revised.
// =========================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadDimensions, sampleBatch } from './sampler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Which corpus tags each OFF-GROUND value resonates with. Ground values map to
// nothing. Provisional — revise freely.
export const DIMENSION_TAG_MAP = {
  attention_unit: { congregation: ['collective'] },
  sensory_register: {
    'visual-primary': ['image'],
    'auditory-primary': ['sound'],
    'haptic-proprioceptive-primary': ['embodiment', 'wearable-body']
  },
  resemblance: {
    abstract: [], cartoon: [], realist: ['image'], hyperreal: ['immersion', 'image']
  },
  authorship_distribution: {
    universal: ['open', 'mass-access'],
    algorithmic: ['ai-generation'],
    'caste-hereditary': ['gatekept-professional']
  },
  provisioning: {
    'welfare-entitlement': ['institution-platform'],
    'civic-duty': ['institution-platform', 'collective'],
    'gift-reciprocal': ['open'],
    patronage: ['patronage-military', 'gatekept-professional']
  },
  custody: {
    'personal-possession': ['personal-computer', 'open'],
    'civic-archive': ['archive-persistence', 'institution-platform'],
    'in-body-mortal': ['wearable-body', 'embodiment']
  },
  literacy_floor: {
    none: ['mass-access'], 'read-only': [],
    'world-build': ['simulation-interactive'],
    'model-train': ['ai-generation', 'simulation-interactive'],
    'perform-from-memory': ['collective']
  },
  compulsion: {
    'freely-optional': ['open'], 'compulsory-by-law': ['institution-platform'],
    initiatory: ['gatekept-professional'], 'forbidden-by-class': ['gatekept-professional']
  },
  metering: {
    unmetered: ['open', 'mass-access'], 'quota-per-person': ['institution-platform']
  }
};

export function loadCorpus(name) {
  return JSON.parse(readFileSync(join(__dirname, 'history', `${name}.json`), 'utf8'));
}

export function loadAllEvents() {
  const out = [];
  for (const name of ['vr', 'silicon-valley']) {
    const c = loadCorpus(name);
    for (const e of c.events) out.push({ ...e, corpus: name });
  }
  return out;
}

// The tags a configuration's off-ground moves resonate with (with multiplicity).
export function configTags(config, dims) {
  const tags = [];
  for (const d of dims) {
    const v = config[d.id];
    if (v === d.ground) continue;
    const t = DIMENSION_TAG_MAP[d.id]?.[v] || [];
    tags.push(...t);
  }
  return tags;
}

function scoreEvent(event, tagList) {
  // one point per matched tag occurrence; rewards events touching several of the
  // present's emphases at once.
  let s = 0;
  for (const t of tagList) if (event.tags.includes(t)) s++;
  return s;
}

/**
 * Select backstory events for a config. Balances across the present's off-ground
 * moves (each move gets its own resonant events) rather than letting the move
 * with the most tags dominate. Dedupes events that appear in both corpora.
 * Returns { tags, events:[{...event, score, matched}], anchorAdded }.
 */
export function selectBackstory(config, dims, opts = {}) {
  const n = opts.n ?? 6;
  const perDim = opts.perDim ?? 3;          // top events per off-ground move
  const anchorId = opts.anchor ?? null;      // no forced ancient anchor (it dragged antiques in)
  const events = opts.events ?? loadAllEvents();

  // Dedupe cross-corpus by normalized label (e.g. the Web is in both pools).
  const seen = new Set();
  const pool = [];
  for (const e of events) {
    const key = e.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(e);
  }

  const offDims = dims.filter(d => d.id in DIMENSION_TAG_MAP
    && config[d.id] !== d.ground
    && (DIMENSION_TAG_MAP[d.id][config[d.id]] || []).length);

  const allTags = new Set();
  const chosen = new Map(); // id -> { event, score, matched:Set }

  for (const d of offDims) {
    const T = DIMENSION_TAG_MAP[d.id][config[d.id]];
    T.forEach(t => allTags.add(t));
    const ranked = pool
      .map(e => ({ e, m: [...new Set(T.filter(t => e.tags.includes(t)))] }))
      .filter(x => x.m.length > 0)
      .sort((x, y) => y.m.length - x.m.length || y.e.year - x.e.year); // ties → more RECENT first (contemporary texture)
    for (const { e, m } of ranked.slice(0, perDim)) {
      const prev = chosen.get(e.id);
      if (prev) { m.forEach(t => prev.matched.add(t)); prev.score += m.length; }
      else chosen.set(e.id, { event: e, score: m.length, matched: new Set(m) });
    }
  }

  // Trim to n, keeping the strongest matches (events resonant with several moves win).
  let picked = [...chosen.values()].sort((a, b) => b.score - a.score || a.event.year - b.event.year).slice(0, n);

  // Deep-root anchor for historical depth if everything clustered post-1900.
  let anchorAdded = false;
  const earliest = picked.reduce((mm, p) => Math.min(mm, p.event.year), Infinity);
  if (earliest > 1900) {
    const anchor = pool.find(e => e.id === anchorId);
    if (anchor && !picked.find(p => p.event.id === anchor.id)) {
      picked.push({ event: anchor, score: 0, matched: new Set(['(anchor)']) });
      anchorAdded = true;
    }
  }

  picked.sort((a, b) => a.event.year - b.event.year);
  return {
    tags: [...allTags],
    events: picked.map(p => ({ ...p.event, score: p.score, matched: [...p.matched] })),
    anchorAdded
  };
}

// A plain-text brief suitable for injecting into a render prompt.
export function assembleBrief(selection) {
  const lines = selection.events.map(e => `- ${e.display} — ${e.label}: ${e.description}`);
  return lines.join('\n');
}

// --- CLI: node sampling/backstory.js [--k N | --k-range LO HI] [--n B] [--seed S] [--configs C] ---
function main(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k') a.k = +argv[++i];
    else if (argv[i] === '--k-range') { a.kLo = +argv[++i]; a.kHi = +argv[++i]; }
    else if (argv[i] === '--n') a.n = +argv[++i];
    else if (argv[i] === '--seed') a.seed = +argv[++i];
    else if (argv[i] === '--configs') a.configs = +argv[++i];
  }
  const dims = loadDimensions();
  const events = loadAllEvents();
  const kSpec = a.kLo != null ? [a.kLo, a.kHi] : (a.k ?? 2);
  const batch = sampleBatch({ dims, kSpec, n: a.configs ?? 3, baseSeed: a.seed ?? 1 });

  console.log(`# backstory selection — ${events.length} events in pool (vr + silicon-valley)\n`);
  for (const s of batch) {
    const off = dims.filter(d => s.config[d.id] !== d.ground)
      .map(d => `${d.label}=${s.config[d.id]}`).join('; ');
    console.log(`── config (k=${s.k}): ${off}`);
    const sel = selectBackstory(s.config, dims, { n: a.n ?? 6, events });
    console.log(`   resonant tags: ${sel.tags.join(', ') || '(none)'}`);
    for (const e of sel.events) {
      console.log(`   ${e.display.padEnd(11)} ${e.label}  [${e.corpus}]  ${e.score ? '±'.repeat(e.score) : 'anchor'}`);
    }
    console.log('');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
