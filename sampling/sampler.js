// =========================================
// sampling/sampler.js — media-present configuration sampler (redesign regime).
//
// The free, deterministic layer of the sampling design. No model calls.
// Author the DIMENSIONS (media-present/dimensions.json); the seeded RNG samples
// the POINTS. A "configuration" assigns exactly one value per dimension.
//
//   ground   = our world's value for a dimension
//   k        = number of dimensions whose value differs from ground
//              (Hamming distance from the all-ground configuration)
//   k = 0    = our present (a forecast)
//   k >= 3   = the band where worlds get strange and may still hold
//
// Sampling is TARGETED by k: uniform sampling over the whole space concentrates
// near k ~ 9 (incoherent noise), so we instead pick exactly k dimensions to move
// off ground. Each sample is reproducible from (baseSeed, index).
// =========================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIMS = join(__dirname, 'media-present', 'dimensions.json');

// --- seeded RNG (mulberry32; self-contained so this regime needs nothing from engine/) ---
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- dimension table ---
export function loadDimensions(path = DEFAULT_DIMS) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return doc.dimensions;
}

export function groundConfig(dims) {
  const cfg = {};
  for (const d of dims) cfg[d.id] = d.ground;
  return cfg;
}

export function kOf(config, dims) {
  let k = 0;
  for (const d of dims) if (config[d.id] !== d.ground) k++;
  return k;
}

// --- core sampling primitives ---
function pickIndex(rng, n) {
  return Math.floor(rng() * n);
}

// Fisher–Yates shuffle of 0..n-1, returns first `take` indices.
function chooseK(rng, n, take) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, take);
}

// Sample one configuration at exactly Hamming distance k from ground.
export function sampleExactK(dims, k, rng) {
  const cfg = groundConfig(dims);
  const chosen = chooseK(rng, dims.length, Math.min(k, dims.length));
  for (const di of chosen) {
    const d = dims[di];
    const alternatives = d.values.filter(v => v !== d.ground);
    cfg[d.id] = alternatives[pickIndex(rng, alternatives.length)];
  }
  return cfg;
}

// Sample a batch. Each item is reproducible from (baseSeed, index).
// kSpec: a number (exact k) or [min, max] (k drawn uniformly per sample).
export function sampleBatch({ dims, kSpec, n = 10, baseSeed = 1 }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rng = makeRng((baseSeed * 2654435761 + i * 40503) >>> 0);
    let k;
    if (Array.isArray(kSpec)) {
      const [lo, hi] = kSpec;
      k = lo + Math.floor(rng() * (hi - lo + 1));
    } else {
      k = kSpec;
    }
    const config = sampleExactK(dims, k, rng);
    out.push({ index: i, seed: baseSeed, k: kOf(config, dims), config });
  }
  return out;
}

// --- human-readable rendering of a configuration ---
export function formatConfig(sample, dims) {
  const width = Math.max(...dims.map(d => d.label.length));
  const lines = [];
  lines.push(`config #${String(sample.index).padStart(3, '0')}   (k=${sample.k})`);
  for (const d of dims) {
    const v = sample.config[d.id];
    const off = v !== d.ground;
    const pad = d.label.padEnd(width);
    lines.push(
      off
        ? `  ${pad} :  ${v}   ← off-ground (was ${d.ground})`
        : `  ${pad} :  ${v}`
    );
  }
  return lines.join('\n');
}

// --- CLI: node sampling/sampler.js [--k N | --k-range LO HI] [--n N] [--seed N] ---
function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k') args.k = Number(argv[++i]);
    else if (argv[i] === '--k-range') { args.kLo = Number(argv[++i]); args.kHi = Number(argv[++i]); }
    else if (argv[i] === '--n') args.n = Number(argv[++i]);
    else if (argv[i] === '--seed') args.seed = Number(argv[++i]);
  }
  const dims = loadDimensions();
  const kSpec = args.kLo != null ? [args.kLo, args.kHi] : (args.k != null ? args.k : [3, 5]);
  const n = args.n ?? 8;
  const baseSeed = args.seed ?? 1;

  const label = Array.isArray(kSpec) ? `k=${kSpec[0]}–${kSpec[1]}` : `k=${kSpec}`;
  console.log(`# media-present sampler  —  ${n} configs, ${label}, seed ${baseSeed}`);
  console.log(`# ${dims.length} dimensions; ground = our present (k=0)\n`);

  const batch = sampleBatch({ dims, kSpec, n, baseSeed });
  for (const s of batch) {
    console.log(formatConfig(s, dims));
    console.log('');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
