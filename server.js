// =========================================
// server.js — zero-dependency local dev server.
//
// Serves the static frontend from public/ and routes /api/<name>
// requests to api/<name>.js, adapting Node's raw http req/res to look
// enough like Vercel's serverless handler signature (req.body,
// req.query, res.status().json()) that the same api/*.js files could
// also be deployed on Vercel unchanged later.
//
// No npm install required — everything here is Node built-ins.
// Run: node server.js  (or `npm run dev`)
// =========================================

import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// --- Load .env (no dependency on dotenv) ---
function loadEnv() {
  const envPath = join(__dirname, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
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

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function shimResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  return res;
}

async function handleApi(name, req, res, url) {
  const modPath = join(__dirname, 'api', `${name}.js`);
  if (!existsSync(modPath)) {
    res.status(404).json({ error: `No API route: ${name}` });
    return;
  }

  try {
    const mod = await import(`file://${modPath}?t=${Date.now()}`); // bust cache in dev
    req.query = Object.fromEntries(url.searchParams);
    req.body  = (req.method === 'POST') ? await readBody(req) : {};
    await mod.default(req, res);
  } catch (err) {
    console.error(`[server] error handling /api/${name}:`, err);
    res.status(500).json({ error: err.message });
  }
}

function serveStatic(pathname, res) {
  let filePath = join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(filePath)) {
    filePath = join(__dirname, 'public', 'index.html'); // SPA fallback
  }
  try {
    const content = readFileSync(filePath);
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
    res.end(content);
  } catch (err) {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  shimResponse(res);
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.replace('/api/', '');
    await handleApi(name, req, res, url);
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Monte Carlo Fiction running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ANTHROPIC_API_KEY not set — world generation will work, but story rendering will fail. Copy .env.example to .env and add your key.');
  }
});
