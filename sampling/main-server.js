import http from 'http';
import { existsSync, readFileSync } from 'fs';
import { extname, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnvFile } from './anthropic.js';
import { listCorpora } from './history.js';
import { generateWorldBatch, DEFAULT_GENERATION_MODEL } from './world-generator.js';
import { clearWorlds, listWorlds, loadWorld } from './world.js';
import {
  clearArtifacts,
  DEFAULT_FORM,
  DEFAULT_RENDER_MODEL,
  FORMS,
  listArtifacts,
  renderedFormsByWorld,
  renderAndSave,
  setVerdict
} from './render-world.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_PORT = Number(process.env.MAIN_PORT || 3000);
loadEnvFile(join(__dirname, '..', '.env.local'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function worldForClient(world, formsMap) {
  return {
    ...world,
    renderedForms: [...(formsMap.get(world.id) || [])]
  };
}

async function handleApi(route, req, res) {
  const body = req.method === 'POST' ? await readBody(req) : {};

  if (route === 'status' && req.method === 'GET') {
    return sendJson(res, 200, { apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
  }
  if (route === 'corpora' && req.method === 'GET') return sendJson(res, 200, { corpora: listCorpora() });
  if (route === 'forms' && req.method === 'GET') {
    return sendJson(res, 200, { forms: Object.keys(FORMS), default: DEFAULT_FORM });
  }

  if (route === 'generate' && req.method === 'POST') {
    if (!process.env.ANTHROPIC_API_KEY) return sendJson(res, 400, { error: 'ANTHROPIC_API_KEY is not set in .env.local.' });
    const corpusId = String(body.corpusId || '');
    const scenarioBrief = String(body.scenarioBrief || '').trim();
    if (!listCorpora().some(corpus => corpus.id === corpusId)) return sendJson(res, 400, { error: `Unknown history corpus: ${corpusId}` });
    if (scenarioBrief.length < 40) return sendJson(res, 400, { error: 'Please provide a more complete divergence and endpoint brief.' });
    const count = Math.max(1, Math.min(20, Number(body.count) || 1));
    const model = String(body.model || DEFAULT_GENERATION_MODEL);
    const result = await generateWorldBatch({ corpusId, scenarioBrief, count, model, save: true });
    if (!result.worlds.length) return sendJson(res, 502, { error: result.errors.map(item => item.error).join('; ') || 'No worlds were generated.' });
    const formsMap = renderedFormsByWorld();
    return sendJson(res, 200, {
      worlds: result.worlds.map(world => worldForClient(world, formsMap)),
      errors: result.errors
    });
  }

  if (route === 'worlds' && req.method === 'GET') {
    const formsMap = renderedFormsByWorld();
    return sendJson(res, 200, { worlds: listWorlds().map(world => worldForClient(world, formsMap)) });
  }

  if (route === 'render' && req.method === 'POST') {
    if (!process.env.ANTHROPIC_API_KEY) return sendJson(res, 400, { error: 'ANTHROPIC_API_KEY is not set in .env.local.' });
    const world = loadWorld(String(body.worldId || ''));
    if (!world) return sendJson(res, 404, { error: `No such world: ${body.worldId}` });
    const form = String(body.form || DEFAULT_FORM);
    const model = String(body.model || DEFAULT_RENDER_MODEL);
    const renderBrief = String(body.renderBrief || '').trim();
    if (renderBrief.length > 2000) return sendJson(res, 400, { error: 'Render brief must be 2,000 characters or fewer.' });
    try { return sendJson(res, 200, await renderAndSave(world, { form, model, renderBrief })); }
    catch (error) { return sendJson(res, 502, { error: error.message }); }
  }

  if (route === 'library' && req.method === 'GET') return sendJson(res, 200, { items: listArtifacts() });

  if (route === 'verdict' && req.method === 'POST') {
    try { return sendJson(res, 200, setVerdict(String(body.id || ''), String(body.verdict || ''), String(body.note || ''))); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
  }

  if (route === 'clear-all' && req.method === 'POST') {
    return sendJson(res, 200, {
      worlds: clearWorlds(),
      artifacts: clearArtifacts()
    });
  }

  return sendJson(res, 404, { error: `No API route: ${route} (${req.method})` });
}

function serveStatic(pathname, res) {
  let path = join(__dirname, 'main', pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(path)) path = join(__dirname, 'main', 'index.html');
  try {
    res.setHeader('Content-Type', MIME[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(url.pathname.slice('/api/'.length), req, res); }
    catch (error) { sendJson(res, 500, { error: error.message }); }
    return;
  }
  serveStatic(url.pathname, res);
});

let port = BASE_PORT;
server.on('listening', () => {
  const actual = server.address().port;
  console.log(`Monte-Carlo-Fiction at http://localhost:${actual}`);
  if (actual !== BASE_PORT) console.log(`  (port ${BASE_PORT} was in use)`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('  ANTHROPIC_API_KEY is not set — generation and rendering will fail.');
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port - BASE_PORT < 20) {
    server.listen(++port);
    return;
  }
  console.error(error);
  process.exit(1);
});
server.listen(port);
