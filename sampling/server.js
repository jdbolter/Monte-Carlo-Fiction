// =========================================
// sampling/server.js — local UI server for the sampling regime.
//
// Zero-dependency (Node built-ins only). Serves sampling/public/ and exposes a
// few JSON endpoints that wrap the free sampler and the paid render step.
// Kept separate from the causal engine's server.js on purpose; runs on its own
// port (default 4000) so both can run at once.
//
//   npm run sample-ui     (or: node sampling/server.js)
// =========================================

import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadDimensions, sampleBatch } from './sampler.js';
import { enumerateExactK, configTag, renderAndSave, setVerdict, listRun } from './render-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.SAMPLING_PORT || 4000;
const RUN_DIR = join(__dirname, 'outputs', 'ui');

// --- Load ../.env.local (same zero-dep approach as the main server) ---
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

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { if (!data) return resolve({}); try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function offGroundFor(config, dims) {
  return dims.filter(d => config[d.id] !== d.ground).map(d => ({
    dimension: d.id, label: d.label, value: config[d.id], ground: d.ground,
    exclusive: !!d.exclusive, gloss: (d.glosses && d.glosses[config[d.id]]) || null
  }));
}

async function handleApi(name, req, res) {
  const dims = loadDimensions();
  const body = req.method === 'POST' ? await readBody(req) : {};

  if (name === 'dimensions' && req.method === 'GET') {
    return sendJson(res, 200, { dimensions: dims });
  }

  if (name === 'sample' && req.method === 'POST') {
    let batch;
    if (body.mode === 'enumerate') {
      const all = enumerateExactK(dims, Number(body.k ?? 2));
      const offset = Number(body.offset || 0), limit = Number(body.limit || 20);
      batch = all.slice(offset, offset + limit);
      batch.total = all.length;
      var total = all.length;
    } else {
      const kSpec = body.kLo != null ? [Number(body.kLo), Number(body.kHi)] : Number(body.k ?? 2);
      batch = sampleBatch({ dims, kSpec, n: Number(body.n || 8), baseSeed: Number(body.seed || 1) });
    }
    const configs = batch.map(s => ({
      tag: configTag(s.config, dims), k: s.k, seed: s.seed ?? null,
      config: s.config, offGround: offGroundFor(s.config, dims)
    }));
    return sendJson(res, 200, { configs, total: typeof total === 'number' ? total : configs.length });
  }

  if (name === 'render' && req.method === 'POST') {
    if (!process.env.ANTHROPIC_API_KEY) return sendJson(res, 400, { error: 'ANTHROPIC_API_KEY not set in .env.local' });
    try {
      const sample = { config: body.config, k: body.k, seed: body.seed ?? null };
      const record = await renderAndSave(sample, dims, RUN_DIR, { model: body.model, form: body.form });
      return sendJson(res, 200, record);
    } catch (e) {
      return sendJson(res, 502, { error: e.message });
    }
  }

  if (name === 'verdict' && req.method === 'POST') {
    try {
      const record = setVerdict(RUN_DIR, body.tag, body.verdict, body.note || '');
      return sendJson(res, 200, record);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (name === 'worlds' && req.method === 'GET') {
    return sendJson(res, 200, { worlds: listRun(RUN_DIR) });
  }

  return sendJson(res, 404, { error: `No API route: ${name} (${req.method})` });
}

function serveStatic(pathname, res) {
  let filePath = join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(filePath)) filePath = join(__dirname, 'public', 'index.html');
  try {
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
    res.end(readFileSync(filePath));
  } catch { res.statusCode = 404; res.end('Not found'); }
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

const BASE = Number(PORT);
let attempt = BASE;
server.on('listening', () => {
  const p = server.address().port;
  console.log(`Sampling UI running at http://localhost:${p}`);
  if (p !== BASE) console.log(`  (port ${BASE} was in use — moved up to ${p})`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('  ANTHROPIC_API_KEY not set — sampling works, but rendering will fail.');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && attempt - BASE < 20) { attempt++; server.listen(attempt); return; }
  console.error('[sampling server] failed:', err); process.exit(1);
});
server.listen(attempt);
