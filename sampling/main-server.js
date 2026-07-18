// =========================================
// sampling/main-server.js — the main app (port 3000).
//
// Generate / Render / Library, over the unified world model. Reuses the same
// world-building and rendering functions as everything else; kept separate from
// the :4000 tuning UI on purpose. Zero dependencies.
//
//   npm run main     (or: node sampling/main-server.js)
// =========================================

import http from 'http';
import { readFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadDimensions, sampleBatch } from './sampler.js';
import { makeWorld, saveWorld, listWorlds, clearWorlds } from './world.js';
import { enumerateExactK, renderAndSave, listRun, setVerdict, FORMS, DEFAULT_FORM } from './render-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.MAIN_PORT || 3000;
const LIB_DIR = join(__dirname, 'outputs', 'library');

function loadEnv() {
  const p = join(__dirname, '..', '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => d += c);
    req.on('end', () => { if (!d) return resolve({}); try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function sendJson(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); }

// light summary of a world for the client
function worldSummary(w) {
  return {
    id: w.id, k: w.dimensions.k, summary: w.summary, seed: w.seed,
    changed: w.dimensions.changed.map(c => ({ dimension: c.dimension, label: c.label, value: c.value, ground: c.ground, exclusive: c.exclusive })),
    facts: w.facts,
    backstory: w.backstory.events.map(e => ({ display: e.display, label: e.label, corpus: e.corpus })),
    rendered: false
  };
}

async function handleApi(name, req, res) {
  const dims = loadDimensions();
  const body = req.method === 'POST' ? await readBody(req) : {};

  if (name === 'dimensions' && req.method === 'GET') return sendJson(res, 200, { dimensions: dims });
  if (name === 'forms' && req.method === 'GET') return sendJson(res, 200, { forms: Object.keys(FORMS), default: DEFAULT_FORM });

  // Generate + save Worlds (free). mode: 'sample' | 'enumerate'.
  if (name === 'generate' && req.method === 'POST') {
    let batch;
    if (body.mode === 'enumerate') {
      const all = enumerateExactK(dims, Number(body.k ?? 2));
      const off = Number(body.offset || 0), lim = Number(body.limit || 20);
      batch = all.slice(off, off + lim);
    } else {
      const kSpec = body.kLo != null ? [Number(body.kLo), Number(body.kHi)] : Number(body.k ?? 2);
      batch = sampleBatch({ dims, kSpec, n: Number(body.n || 6), baseSeed: Number(body.seed || 1) });
    }
    const worlds = batch.map(s => makeWorld(s.config, dims, { seed: s.seed ?? null }));
    worlds.forEach(saveWorld);
    return sendJson(res, 200, { worlds: worlds.map(worldSummary) });
  }

  // List saved (generated) Worlds, flagged with whether they've been rendered.
  if (name === 'worlds' && req.method === 'GET') {
    const renderedTags = new Set(listRun(LIB_DIR).map(r => r.tag));
    const worlds = listWorlds().map(w => {
      const s = worldSummary(w);
      // library tag = configTag(config) which is w.id minus the "w-" prefix
      s.rendered = renderedTags.has(w.id.replace(/^w-/, ''));
      return s;
    }).sort((a, b) => a.k - b.k || a.id.localeCompare(b.id));
    return sendJson(res, 200, { worlds });
  }

  // Render a saved World into an artifact (costs API).
  if (name === 'render' && req.method === 'POST') {
    if (!process.env.ANTHROPIC_API_KEY) return sendJson(res, 400, { error: 'ANTHROPIC_API_KEY not set in .env.local' });
    const world = listWorlds().find(w => w.id === body.worldId);
    if (!world) return sendJson(res, 404, { error: `no such world: ${body.worldId}` });
    try {
      const sample = { config: world.dimensions.all, k: world.dimensions.k, seed: world.seed };
      const record = await renderAndSave(sample, dims, LIB_DIR, { form: body.form || DEFAULT_FORM, model: body.model });
      return sendJson(res, 200, record);
    } catch (e) { return sendJson(res, 502, { error: e.message }); }
  }

  // The library: everything rendered, with verdicts.
  if (name === 'library' && req.method === 'GET') return sendJson(res, 200, { items: listRun(LIB_DIR) });

  // Clear saved generated Worlds (the pool the Render tab draws from).
  if (name === 'clear-worlds' && req.method === 'POST') return sendJson(res, 200, { cleared: clearWorlds() });

  // Clear the library (rendered artifacts + scorecard).
  if (name === 'clear-library' && req.method === 'POST') {
    let n = 0;
    if (existsSync(LIB_DIR)) for (const f of readdirSync(LIB_DIR)) { try { unlinkSync(join(LIB_DIR, f)); n++; } catch {} }
    return sendJson(res, 200, { cleared: n });
  }

  if (name === 'verdict' && req.method === 'POST') {
    try { return sendJson(res, 200, setVerdict(LIB_DIR, body.tag, body.verdict, body.note || '')); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  return sendJson(res, 404, { error: `No API route: ${name} (${req.method})` });
}

function serveStatic(pathname, res) {
  let fp = join(__dirname, 'main', pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(fp)) fp = join(__dirname, 'main', 'index.html');
  try { res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream'); res.end(readFileSync(fp)); }
  catch { res.statusCode = 404; res.end('Not found'); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(url.pathname.replace('/api/', ''), req, res); }
    catch (e) { sendJson(res, 500, { error: e.message }); }
    return;
  }
  serveStatic(url.pathname, res);
});

const BASE = Number(PORT); let attempt = BASE;
server.on('listening', () => {
  const p = server.address().port;
  console.log(`Monte-Carlo-Fiction main app at http://localhost:${p}`);
  if (p !== BASE) console.log(`  (port ${BASE} in use — moved to ${p})`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('  ANTHROPIC_API_KEY not set — generating works, rendering will fail.');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && attempt - BASE < 20) { attempt++; server.listen(attempt); return; }
  console.error('[main-server] failed:', err); process.exit(1);
});
server.listen(attempt);
