// =========================================
// sampling/render-config.js — the renderer (Layer 2). Consumes a WORLD.
//
// Given a World (from world.js: changed dimensions + world-facts + backstory),
// ask the model to write an ARTIFACT in a chosen form — never an analytic essay.
// The prompt is built from world.facts + world.backstory (no dimension vocabulary),
// so the output depicts the world instead of describing a configuration.
//
// Calls the Anthropic API; costs money per world. Retries on Overloaded (529),
// paces requests, and --resume skips already-rendered worlds.
//
// Usage:
//   node sampling/render-config.js --k 2 --n 3 --seed 1 --form found-document
//   node sampling/render-config.js --k-range 1 2 --n 6 --seed 7 --form scene
//   node sampling/render-config.js --enumerate --k 2 --form found-document --resume
//   node sampling/render-config.js --k 2 --n 2 --seed 1 --dry-run       # print prompt, no API
// =========================================

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadDimensions, sampleBatch, groundConfig, kOf } from './sampler.js';
import { makeWorld } from './world.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(__dirname, 'outputs');

// --- Load ../.env.local ---
function loadEnv() {
  const envPath = join(__dirname, '..', '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

// ---------------- forms ----------------
export const FORMS = {
  'found-document': `Write a single primary-source document from inside this world, about 250 words — a notice, listing, warranty, certificate, syllabus, obituary, ration card, memo, or letter. It must read as genuine found material: no framing, no explanation, only the document itself. The world's rules are implicit in the document's form and details, never stated.`,
  'scene': `Write a single scene, about 350 words, with one ordinary person doing an ordinary thing in this world. Convey how the world works only through what they do, see, and take for granted — never explain it. Begin inside the scene.`,
  'testimony': `Write about 300 words of first-person testimony from someone describing their ordinary media life, unaware that any of it is unusual. Plain speech, concrete particulars. Never name the underlying logic; let it sit in what they consider normal.`
};
export const DEFAULT_FORM = 'found-document';

const SYSTEM = `You are given a set of WORLD-FACTS describing a media present that differs from our own, plus a LINEAGE of real historical events behind it. Write the requested artifact — a piece of writing from inside this world.

Reading the world-facts:
- Honor every world-fact, but treat each as the dominant GRAIN of the culture's media — what its most important and characteristic media are like — not a literal rule governing every message. Ordinary information (news, weather, a note to a friend) still travels by whatever means is natural; the facts tell you where the culture's central, prestigious, attention-holding media sit, not that every scrap of communication obeys them. (A world whose important media are bodily and felt still tells you tomorrow's weather in words.)
- "Predominantly" or "mostly" means the leading mode, not the only one. A flat statement holds broadly, but need not be pushed to absurd totality.
- Add no new differences of your own, and do not quietly drift back toward our own present.

Using the lineage:
- It is this world's deep history — the origins that explain how its media came to be this way. Use it to understand the world, not to name-drop. Treat these events as we treat the printing press or the telegraph: distant history, not current or recent technology. NEVER depict an old device as something people still use. At most the very newest items surface as ordinary background; the ancient ones are heritage a character would rarely mention, if ever.

Tone:
- This is neither a warning nor a utopia. Render it as a lived, ordinary present with the ordinary mixture of the mundane, the comforting, the irritating, and the poignant. Do NOT default to dystopia or ominous science fiction — many of these worlds are simply someone's normal life. Let the register vary (warm, dry, wistful, matter-of-fact); reach for the ominous only if the facts truly demand it.

Craft:
- DEPICT; do not analyze. Use no analytic or media-studies vocabulary. Never use the words "dimension," "media present," "configuration," "variable," or name any category — write from inside the world, not about it.
- Begin inside the world. No preamble about the exercise; no title unless the form calls for one.`;

export function buildRenderPrompt(world, { form = DEFAULT_FORM } = {}) {
  const task = FORMS[form] || FORMS[DEFAULT_FORM];
  const userPrompt = [
    task,
    '',
    'WORLD-FACTS (all hold in this world):',
    ...world.facts.map(f => `- ${f}`),
    '',
    'LINEAGE (the deep history behind how this world\'s media came to be — for your understanding; do not recount it, and do not present old technology as current):',
    world.backstory.brief || '(none)',
    ''
  ].join('\n');
  return { systemPrompt: SYSTEM, userPrompt };
}

// ---------------- Anthropic call with retry/backoff ----------------
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function renderWorld(world, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  const model = opts.model || 'claude-sonnet-5';
  const maxTokens = opts.maxTokens || 1400;
  const maxRetries = opts.maxRetries ?? 6;
  const { systemPrompt, userPrompt } = buildRenderPrompt(world, { form: opts.form });
  const body = JSON.stringify({
    model, max_tokens: maxTokens, system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }], thinking: { type: 'disabled' }
  });
  const backoff = a => Math.min(30000, 1000 * 2 ** (a + 1)) + Math.floor(Math.random() * 500);

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stop_reason === 'max_tokens') throw Object.assign(new Error(`truncated (max_tokens=${maxTokens})`), { fatal: true });
        return data.content?.[0]?.text ?? '';
      }
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `Anthropic API error ${res.status}`;
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
        const ra = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt);
        process.stderr.write(`[${msg}; retry ${attempt + 1}/${maxRetries} in ${Math.round(wait / 1000)}s] `);
        lastErr = new Error(msg); await sleep(wait); continue;
      }
      throw new Error(msg);
    } catch (e) {
      if (e.fatal) throw e;
      if (/fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(e.message || '') && attempt < maxRetries) {
        const wait = backoff(attempt);
        process.stderr.write(`[${e.message}; retry ${attempt + 1}/${maxRetries} in ${Math.round(wait / 1000)}s] `);
        lastErr = e; await sleep(wait); continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('render failed after retries');
}

// ---------------- enumerate the finite low-k space ----------------
function* combinations(arr, k) {
  const n = arr.length; if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map(i => arr[i]);
    let i = k - 1; while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++; for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}
function* product(arrays) {
  if (!arrays.length) { yield []; return; }
  const [first, ...rest] = arrays;
  for (const v of first) for (const tail of product(rest)) yield [v, tail].flat();
}
export function enumerateExactK(dims, k) {
  const out = []; const dimIdx = dims.map((_, i) => i); let c = 0;
  for (const subset of combinations(dimIdx, k)) {
    const altLists = subset.map(di => dims[di].values.filter(v => v !== dims[di].ground));
    for (const combo of product(altLists)) {
      const cfg = groundConfig(dims);
      subset.forEach((di, j) => { cfg[dims[di].id] = combo[j]; });
      out.push({ index: c++, seed: null, k: kOf(cfg, dims), config: cfg });
    }
  }
  return out;
}

// stable id from a config's changed moves (used as the UI/scorecard tag)
export function configTag(config, dims) {
  const changed = dims.filter(d => config[d.id] !== d.ground);
  const key = changed.map(d => `${d.id}:${config[d.id]}`).sort().join('|');
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `k${changed.length}-${h.toString(36)}`;
}

// ---------------- render + save a world ----------------
function movesString(rec) {
  return (rec.offGround || []).map(o => `${o.dimension}=${o.value} (was ${o.ground})`).join('; ');
}

export async function renderAndSave(sample, dims, runDir, opts = {}) {
  const form = opts.form || DEFAULT_FORM;
  const world = makeWorld(sample.config, dims, { seed: sample.seed ?? null });
  const text = await renderWorld(world, { ...opts, form });
  const tag = opts.tag || configTag(sample.config, dims);
  const record = {
    tag, form, k: world.dimensions.k, seed: sample.seed ?? null, model: opts.model || 'claude-sonnet-5',
    summary: world.summary,
    facts: world.facts,
    offGround: world.dimensions.changed.map(c => ({ dimension: c.dimension, value: c.value, ground: c.ground })),
    backstory: world.backstory.events.map(e => ({ display: e.display, label: e.label, corpus: e.corpus })),
    text, verdict: '', note: '', renderedAt: new Date().toISOString()
  };
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, `${tag}.json`), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

// ---------------- readable + scorecard (from JSON records) ----------------
export function writeReadable(runDir, records) {
  const out = [`# Rendered worlds — ${runDir.split('/').pop()}`, '',
    `${records.length} worlds. Read here; record verdicts in scorecard.md.`, ''];
  for (const r of records) {
    out.push(`## ${r.tag}  (k=${r.k}, ${r.form})`);
    out.push(`*${r.summary}*`, '');
    out.push(r.text.trim(), '', '---', '');
  }
  writeFileSync(join(runDir, 'worlds.md'), out.join('\n'), 'utf8');
}
export function writeScorecardFromRecords(runDir) {
  const recs = readdirSync(runDir).filter(f => /\.json$/.test(f))
    .map(f => JSON.parse(readFileSync(join(runDir, f), 'utf8'))).sort((a, b) => a.tag.localeCompare(b.tag));
  const out = [`# Scorecard — ${runDir.split('/').pop()}`, '',
    'Fill **verdict** with one of: `cohere` / `strain` / `incoherent`. Notes optional.',
    'When done: paste this file back into the chat.', '',
    '| tag | k | form | off-ground moves | verdict | notes |',
    '|-----|---|------|------------------|---------|-------|'];
  for (const r of recs) out.push(`| ${r.tag} | ${r.k} | ${r.form} | ${movesString(r)} | ${r.verdict || ''} | ${r.note || ''} |`);
  writeFileSync(join(runDir, 'scorecard.md'), out.join('\n') + '\n', 'utf8');
  return recs.length;
}
function rebuildRun(runDir) {
  const recs = readdirSync(runDir).filter(f => /\.json$/.test(f))
    .map(f => JSON.parse(readFileSync(join(runDir, f), 'utf8'))).sort((a, b) => a.tag.localeCompare(b.tag));
  if (recs.length) { writeReadable(runDir, recs); writeScorecardFromRecords(runDir); }
  return recs.length;
}
export function setVerdict(runDir, tag, verdict, note = '') {
  const p = join(runDir, `${tag}.json`);
  if (!existsSync(p)) throw new Error(`no such world: ${tag}`);
  const rec = JSON.parse(readFileSync(p, 'utf8'));
  rec.verdict = verdict; rec.note = note;
  writeFileSync(p, JSON.stringify(rec, null, 2), 'utf8');
  writeScorecardFromRecords(runDir);
  return rec;
}
export function listRun(runDir) {
  if (!existsSync(runDir)) return [];
  return readdirSync(runDir).filter(f => /\.json$/.test(f))
    .map(f => JSON.parse(readFileSync(join(runDir, f), 'utf8'))).sort((a, b) => a.tag.localeCompare(b.tag));
}

// ---------------- CLI ----------------
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--k') a.k = Number(argv[++i]);
    else if (t === '--k-range') { a.kLo = Number(argv[++i]); a.kHi = Number(argv[++i]); }
    else if (t === '--n') a.n = Number(argv[++i]);
    else if (t === '--seed') a.seed = Number(argv[++i]);
    else if (t === '--form') a.form = argv[++i];
    else if (t === '--enumerate') a.enumerate = true;
    else if (t === '--limit') a.limit = Number(argv[++i]);
    else if (t === '--dry-run') a.dryRun = true;
    else if (t === '--resume') a.resume = true;
    else if (t === '--model') a.model = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dims = loadDimensions();
  const form = args.form || DEFAULT_FORM;
  if (!FORMS[form]) { console.error(`Unknown --form "${form}". Options: ${Object.keys(FORMS).join(', ')}`); process.exit(1); }
  const seed = args.seed ?? 1;
  const model = args.model || 'claude-sonnet-5';

  let batch, label;
  if (args.enumerate) {
    if (args.k == null) { console.error('--enumerate requires --k'); process.exit(1); }
    batch = enumerateExactK(dims, args.k); label = `enum-k${args.k}-${form}`;
  } else {
    const kSpec = args.kLo != null ? [args.kLo, args.kHi] : (args.k ?? 2);
    batch = sampleBatch({ dims, kSpec, n: args.n ?? 3, baseSeed: seed });
    label = (Array.isArray(kSpec) ? `k${kSpec[0]}-${kSpec[1]}` : `k${kSpec}`) + `-${form}-seed${seed}`;
  }
  if (args.limit != null) batch = batch.slice(0, args.limit);

  console.log(`# render — ${batch.length} world(s), ${label}, model ${model}${args.dryRun ? '  [DRY RUN — no API]' : ''}\n`);

  if (args.dryRun) {
    for (const s of batch) {
      const world = makeWorld(s.config, dims, { seed: s.seed });
      const { userPrompt } = buildRenderPrompt(world, { form });
      console.log('─'.repeat(70));
      console.log(`${world.id}  (k=${world.dimensions.k}) — ${world.summary}`);
      console.log('\n--- USER PROMPT ---\n' + userPrompt);
    }
    console.log(`(system prompt identical for every call; ${SYSTEM.length} chars; form: ${form})`);
    return;
  }

  const runDir = join(OUT_ROOT, label);
  mkdirSync(runDir, { recursive: true });
  const delay = 700; const maxRetries = 6; let ok = 0, skipped = 0, calls = 0;
  for (const s of batch) {
    const tag = configTag(s.config, dims);
    const outPath = join(runDir, `${tag}.json`);
    if (args.resume && existsSync(outPath)) { console.log(`skip ${tag} (k=${s.k}) — already rendered`); skipped++; continue; }
    if (calls > 0) await sleep(delay);
    calls++;
    process.stdout.write(`rendering ${tag} (k=${s.k}, ${form}) … `);
    try {
      await renderAndSave(s, dims, runDir, { form, model, maxRetries, tag });
      ok++; console.log('ok');
    } catch (e) { console.log('FAILED: ' + e.message); }
  }
  const total = rebuildRun(runDir);
  console.log(`\n# this run: ${ok} rendered${skipped ? `, ${skipped} skipped` : ''}; folder now holds ${total} worlds → ${runDir}`);
  console.log(`#   read:  ${join(runDir, 'worlds.md')}`);
  console.log(`#   judge: ${join(runDir, 'scorecard.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
