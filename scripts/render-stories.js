#!/usr/bin/env node
// =========================================
// scripts/render-stories.js — CLI wrapper around engine/render.js
//
// Renders prose for a whole batch of already-generated worlds in one
// command, instead of clicking "Render story" on each world card in
// the web UI one at a time.
//
// Usage:
//   node scripts/render-stories.js --theme vr-immersion            # renders every un-rendered world
//   node scripts/render-stories.js --theme vr-immersion --limit 10 # cap how many to render this run
//   node scripts/render-stories.js --theme vr-immersion --world-id vr-immersion-0007
//   npm run render -- --theme vr-immersion --limit 10
//
// Requires ANTHROPIC_API_KEY (loaded from .env.local). Each rendered story is
// one real model call — see MONTE_CARLO_STRATEGY.md / CLAUDE.md for cost notes.
// =========================================

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTheme } from '../engine/theme-loader.js';
import { listWorlds } from '../engine/worldgen.js';
import { renderStory, saveStory, listStories } from '../engine/render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load .env.local (same zero-dependency approach as server.js) ---
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

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const themeId = args.theme;
const limit   = args.limit ? Number(args.limit) : Infinity;
const onlyId  = args['world-id'];

if (!themeId) {
  console.error('Usage: node scripts/render-stories.js --theme <themeId> [--limit <n>] [--world-id <id>]');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  process.exit(1);
}

const theme = loadTheme(themeId);
let worlds  = listWorlds(themeId).sort((a, b) => a.seed - b.seed);

if (onlyId) {
  worlds = worlds.filter(w => w.worldId === onlyId);
} else {
  const alreadyRendered = new Set(listStories(themeId).map(s => s.worldId));
  worlds = worlds.filter(w => !alreadyRendered.has(w.worldId));
}

worlds = worlds.slice(0, limit);

if (worlds.length === 0) {
  console.log('Nothing to render — all worlds already have stories (or none match the given world-id).');
  process.exit(0);
}

console.log(`Rendering ${worlds.length} stor${worlds.length === 1 ? 'y' : 'ies'} for theme "${themeId}"...`);

let done = 0;
for (const world of worlds) {
  process.stdout.write(`  [${done + 1}/${worlds.length}] ${world.worldId}... `);
  try {
    const story = await renderStory(theme, world);
    saveStory(story);
    console.log(`done (${story.wordCount} words)`);
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
  }
  done++;
}

console.log(`\nSaved to outputs/stories/${themeId}/`);
