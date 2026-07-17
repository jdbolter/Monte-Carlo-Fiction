// =========================================
// sampling/render-config.js — the render/rationalize step (Layer 2 of the
// sampling regime). Calls the Anthropic API; costs real money per config.
//
// Given a sampled media-present configuration (from sampler.js), ask the model
// to RATIONALIZE it into a coherent described present — find the single logic
// under which the off-ground moves cohere, without choosing the destination
// (the RNG already did) and without drifting back toward the consensus present.
//
// Usage:
//   node sampling/render-config.js --k 2 --n 3 --seed 1
//   node sampling/render-config.js --k-range 1 2 --n 5 --seed 7
//   node sampling/render-config.js --enumerate --k 1            # all 62 k=1 worlds
//   node sampling/render-config.js --k 2 --n 3 --seed 1 --dry-run   # print prompts, NO API call
//
// Reads ANTHROPIC_API_KEY from ../.env.local (same zero-dep loader as the repo).
// =========================================

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  loadDimensions, sampleBatch, sampleExactK, groundConfig, kOf, formatConfig, makeRng
} from './sampler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT  = join(__dirname, 'outputs');

// --- Load ../.env.local (same approach as scripts/render-stories.js) ---
function loadEnv() {
  const envPath = join(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

// --- prompt construction (k-aware) ---
const SYSTEM = `You are given a "media present": a complete configuration of a society's dominant media, specified across 11 dimensions. Most dimensions sit at GROUND — the same value as our actual present — and a small number are OFF-GROUND, moved to a different value. This configuration was chosen by a random number generator, not by you and not by any person. Your job is to RATIONALIZE it, not to judge or improve it.

Rules:
- Treat the off-ground moves as fixed facts of this world: do not substitute them, cancel them, or add further changes of your own, and do not drift back toward our consensus present or familiar techno-forecast imagery.
- Each dimension is tagged [exclusive] or [emphasis]. For an [exclusive] dimension the named value strictly holds and its alternatives do not exist in this world. For an [emphasis] dimension the value names what PREDOMINATES or is especially important — render it as the dominant mode, not an absolute erasure of the others; rival modes may persist in the background where that is realistic.
- A value gloss (text after an em dash) explains what a value means; use it and do not contradict it.
- Find the SINGLE underlying logic or theme under which the off-ground moves cohere into one world — not a list of separate changes, but the institution or condition that makes them one thing.
- Ground values are our world; do not re-explain them. Spend your words on how the off-ground moves reshape everyday media life, and on the felt texture of the result.
- Hold valence open. If the world admits both a controlling and a liberating reading, present the tension rather than resolving it. The undecidability is often the story.
- Stay concrete and legible: what a person experiences, what institutions exist, what changes about receiving and making media. Invent named characters or scenes if useful; do not invent new geographies or new dimensions beyond those specified.
- If the moves genuinely resist coherence, find the most disciplined single reading available and say plainly where it strains — do not paper over it.`;

function taskLineForK(k) {
  if (k <= 1) {
    return 'This world differs from ours in exactly ONE dimension. Lift that single change into the foreground and explore it deeply against an otherwise-familiar present: follow its consequences through everyday media life until the one hinge reorganizes the whole.';
  }
  if (k === 2) {
    return 'This world differs from ours in exactly TWO dimensions. Find and hold the single theme that unites both moves into one institution or condition; let the two changes explain each other rather than sit side by side.';
  }
  return `This world differs from ours in ${k} dimensions. Find the strongest single logic that binds as many of them as possible; if one move will not join the others, say so plainly rather than forcing it.`;
}

function configLines(sample, dims) {
  const off = [];
  const gloss = (d, v) => (d.glosses && d.glosses[v] ? ` — ${d.glosses[v]}` : '');
  const lines = dims.map(d => {
    const v = sample.config[d.id];
    const mode = d.exclusive ? 'exclusive' : 'emphasis';
    const g = gloss(d, v);
    if (v !== d.ground) {
      off.push(`${d.label} [${mode}]: ${v}${g} (our world: ${d.ground})`);
      return `- ${d.label} [${mode}] (${d.description}): ${v}${g}   [OFF-GROUND — our world: ${d.ground}]`;
    }
    return `- ${d.label} [${mode}]: ${v}${g}   [ground]`;
  });
  return { lines, off };
}

export function buildConfigPrompt(sample, dims, { words = 400 } = {}) {
  const { lines, off } = configLines(sample, dims);
  const userPrompt = [
    taskLineForK(sample.k),
    '',
    `The off-ground move${off.length === 1 ? '' : 's'} (this is what makes this world differ from ours):`,
    ...off.map(o => `  • ${o}`),
    '',
    `The full configuration across all ${dims.length} dimensions:`,
    ...lines,
    '',
    `Write a coherent description of this media present in roughly ${words} words of continuous prose (no headings, no lists). Begin in the world, not with a preamble about the exercise.`
  ].join('\n');
  return { systemPrompt: SYSTEM, userPrompt };
}

// --- enumerate all configurations at exactly k (for the finite low-k space) ---
function* combinations(arr, k) {
  const n = arr.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map(i => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function* product(arrays) {
  if (!arrays.length) { yield []; return; }
  const [first, ...rest] = arrays;
  for (const v of first) for (const tail of product(rest)) yield [v, tail].flat();
}

export function enumerateExactK(dims, k) {
  const out = [];
  const dimIdx = dims.map((_, i) => i);
  let counter = 0;
  for (const subset of combinations(dimIdx, k)) {
    const altLists = subset.map(di => dims[di].values.filter(v => v !== dims[di].ground));
    for (const combo of product(altLists)) {
      const cfg = groundConfig(dims);
      subset.forEach((di, j) => { cfg[dims[di].id] = combo[j]; });
      out.push({ index: counter++, seed: null, k: kOf(cfg, dims), config: cfg });
    }
  }
  return out;
}

// --- Anthropic API call (mirrors engine/render-verbal.js) with retry/backoff ---
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]); // 529 = Overloaded
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rationalize(sample, dims, { model, maxTokens, words, maxRetries = 6 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  const { systemPrompt, userPrompt } = buildConfigPrompt(sample, dims, { words });
  const bodyStr = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    thinking: { type: 'disabled' }
  });

  const backoffMs = a => Math.min(30000, 1000 * 2 ** (a + 1)) + Math.floor(Math.random() * 500);
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: bodyStr
      });
      if (response.ok) {
        const data = await response.json();
        if (data.stop_reason === 'max_tokens') {
          throw Object.assign(new Error(`truncated (hit max_tokens=${maxTokens})`), { fatal: true });
        }
        return data.content?.[0]?.text ?? '';
      }
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `Anthropic API error ${response.status}`;
      if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        const ra = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoffMs(attempt);
        process.stderr.write(`[${msg}; retry ${attempt + 1}/${maxRetries} in ${Math.round(wait / 1000)}s] `);
        lastErr = new Error(msg); await sleep(wait); continue;
      }
      throw new Error(msg);
    } catch (e) {
      if (e.fatal) throw e;                               // don't retry truncation
      const transient = /fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(e.message || '');
      if (transient && attempt < maxRetries) {
        const wait = backoffMs(attempt);
        process.stderr.write(`[${e.message}; retry ${attempt + 1}/${maxRetries} in ${Math.round(wait / 1000)}s] `);
        lastErr = e; await sleep(wait); continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('render failed after retries');
}

function offGroundList(sample, dims) {
  return dims.filter(d => sample.config[d.id] !== d.ground)
    .map(d => ({ dimension: d.id, value: sample.config[d.id], ground: d.ground }));
}

function movesString(record) {
  return record.offGround.map(o => `${o.dimension}=${o.value} (was ${o.ground})`).join('; ');
}

// worlds.md — the one file you READ: every rendered world, in order.
function writeReadable(runDir, records) {
  const out = [`# Rendered worlds — ${runDir.split('/').pop()}`, '',
    `${records.length} worlds. Read here; record verdicts in scorecard.md.`, ''];
  for (const r of records) {
    out.push(`## ${r.tag}  (k=${r.k})`);
    out.push(`*off-ground:* ${movesString(r)}`, '');
    out.push(r.text.trim(), '', '---', '');
  }
  writeFileSync(join(runDir, 'worlds.md'), out.join('\n'), 'utf8');
}

// scorecard.md — the one file you FILL: verdict per world.
function writeScorecard(runDir, records) {
  const out = [`# Scorecard — ${runDir.split('/').pop()}`, '',
    'Fill **verdict** with one of: `cohere` / `strain` / `incoherent`. Notes optional.',
    'When done: run the harness on this folder, or paste this file back into the chat.', '',
    '| tag | k | off-ground moves | verdict | notes |',
    '|-----|---|------------------|---------|-------|'];
  for (const r of records) {
    out.push(`| ${r.tag} | ${r.k} | ${movesString(r)} |  |  |`);
  }
  writeFileSync(join(runDir, 'scorecard.md'), out.join('\n') + '\n', 'utf8');
}

// Parse any verdicts already entered in an existing scorecard, so a rebuild
// (after a resumed/interrupted run) never clobbers judgments you've written.
function readExistingVerdicts(runDir) {
  const map = new Map();
  const p = join(runDir, 'scorecard.md');
  if (!existsSync(p)) return map;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*\d+\s*\|[^|]*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (m && m[1].trim() !== 'tag') map.set(m[1].trim(), { verdict: m[2].trim(), notes: m[3].trim() });
  }
  return map;
}

// Rebuild worlds.md + scorecard.md from EVERY rendered JSON on disk (not just
// this run's), preserving existing verdicts. Robust to interrupted/resumed runs.
function rebuildOutputs(runDir) {
  const recs = readdirSync(runDir)
    .filter(f => /^[se][\d-]*\d\.json$/.test(f))
    .map(f => JSON.parse(readFileSync(join(runDir, f), 'utf8')))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  if (!recs.length) return 0;
  writeReadable(runDir, recs);
  const verdicts = readExistingVerdicts(runDir);
  const out = [`# Scorecard — ${runDir.split('/').pop()}`, '',
    'Fill **verdict** with one of: `cohere` / `strain` / `incoherent`. Notes optional.',
    'When done: paste this file back into the chat.', '',
    '| tag | k | off-ground moves | verdict | notes |',
    '|-----|---|------------------|---------|-------|'];
  for (const r of recs) {
    const v = verdicts.get(r.tag) || { verdict: '', notes: '' };
    out.push(`| ${r.tag} | ${r.k} | ${movesString(r)} | ${v.verdict} | ${v.notes} |`);
  }
  writeFileSync(join(runDir, 'scorecard.md'), out.join('\n') + '\n', 'utf8');
  return recs.length;
}

// --- CLI ---
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--k') a.k = Number(argv[++i]);
    else if (t === '--k-range') { a.kLo = Number(argv[++i]); a.kHi = Number(argv[++i]); }
    else if (t === '--n') a.n = Number(argv[++i]);
    else if (t === '--seed') a.seed = Number(argv[++i]);
    else if (t === '--enumerate') a.enumerate = true;
    else if (t === '--limit') a.limit = Number(argv[++i]);
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '--model') a.model = argv[++i];
    else if (t === '--max-tokens') a.maxTokens = Number(argv[++i]);
    else if (t === '--words') a.words = Number(argv[++i]);
    else if (t === '--delay') a.delay = Number(argv[++i]);
    else if (t === '--max-retries') a.maxRetries = Number(argv[++i]);
    else if (t === '--resume') a.resume = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dims = loadDimensions();
  const model = args.model || 'claude-sonnet-5';
  const maxTokens = args.maxTokens || 1400;
  const words = args.words || 400;
  const seed = args.seed ?? 1;

  // Build the list of configs to render.
  let batch;
  let label;
  if (args.enumerate) {
    if (args.k == null) { console.error('--enumerate requires --k (e.g. --enumerate --k 1)'); process.exit(1); }
    batch = enumerateExactK(dims, args.k);
    label = `enum-k${args.k}`;
  } else {
    const kSpec = args.kLo != null ? [args.kLo, args.kHi] : (args.k != null ? args.k : 2);
    batch = sampleBatch({ dims, kSpec, n: args.n ?? 3, baseSeed: seed });
    label = Array.isArray(kSpec) ? `k${kSpec[0]}-${kSpec[1]}-seed${seed}` : `k${kSpec}-seed${seed}`;
  }
  if (args.limit != null) batch = batch.slice(0, args.limit);

  console.log(`# render-config  —  ${batch.length} config(s), ${label}, model ${model}${args.dryRun ? '  [DRY RUN — no API calls]' : ''}`);
  console.log(`# ${dims.length} dimensions; ground = our present\n`);

  if (args.dryRun) {
    // Show the assembled prompt for each config — proves the plumbing, spends nothing.
    for (const s of batch) {
      const { systemPrompt, userPrompt } = buildConfigPrompt(s, dims, { words });
      console.log('─'.repeat(70));
      console.log(formatConfig(s, dims));
      console.log('\n--- USER PROMPT ---\n' + userPrompt + '\n');
    }
    console.log(`(system prompt is identical for every call; ${SYSTEM.length} chars)`);
    return;
  }

  const runDir = join(OUT_ROOT, label);
  mkdirSync(runDir, { recursive: true });
  const delay = args.delay ?? 700;         // gentle pacing between calls (ms)
  const maxRetries = args.maxRetries ?? 6;  // backoff retries on Overloaded/transient
  let ok = 0, skipped = 0, apiCalls = 0;
  for (let bi = 0; bi < batch.length; bi++) {
    const s = batch[bi];
    const tag = args.enumerate ? `e${String(s.index).padStart(4, '0')}` : `s${seed}-${String(s.index).padStart(3, '0')}`;
    const outPath = join(runDir, `${tag}.json`);
    if (args.resume && existsSync(outPath)) {
      console.log(`skip ${tag} (k=${s.k}) — already rendered`);
      skipped++;
      continue;
    }
    if (apiCalls > 0 && delay) await sleep(delay);
    apiCalls++;
    process.stdout.write(`rendering ${tag} (k=${s.k}) … `);
    try {
      const text = await rationalize(s, dims, { model, maxTokens, words, maxRetries });
      const record = {
        tag, k: s.k, seed: s.seed, model,
        offGround: offGroundList(s, dims),
        config: s.config,
        text,
        renderedAt: new Date().toISOString()
      };
      writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf8');
      ok++;
      console.log('ok');
    } catch (e) {
      console.log('FAILED: ' + e.message);
    }
  }
  const total = rebuildOutputs(runDir);
  console.log(`\n# this run: ${ok} rendered${skipped ? `, ${skipped} skipped (already present)` : ''}`);
  console.log(`# folder now holds ${total} worlds → ${runDir}`);
  console.log(`#   read:  ${join(runDir, 'worlds.md')}`);
  console.log(`#   judge: ${join(runDir, 'scorecard.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
