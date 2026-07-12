#!/usr/bin/env node
// =========================================
// scripts/experiment-extrapolation.js — ONE-OFF EXPERIMENT, not part of the
// engine. Tests a render-prompt variant that asks the model to extrapolate
// ~10 years past a world's last real milestone, disciplined by the world's
// trajectory description and accumulated downstream_effects, rather than
// inventing a canned fictional milestone in the pool itself.
//
// Does NOT modify engine/render-verbal.js or any theme config. Safe to
// delete after reviewing the output.
//
// Usage:
//   node scripts/experiment-extrapolation.js --theme vr-immersion --world-id vr-immersion-0001
// =========================================

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTheme } from '../engine/theme-loader.js';
import { loadWorld } from '../engine/worldgen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- SANDBOX-ONLY: this dev environment routes outbound HTTPS through a
// local CONNECT proxy (visible via the https_proxy env var). curl honors
// this automatically; Node's built-in fetch (undici) does not, and the
// `undici` package isn't installed here to configure a ProxyAgent manually
// (this project deliberately has zero dependencies). Rather than add a
// dependency for a one-off test, shell out to curl — which already proved
// it can reach the API through the proxy — when a proxy is configured.
// This has nothing to do with production use: on a normal machine (e.g.
// running this in VS Code) there is no proxy and USE_CURL stays false.
const USE_CURL = !!(process.env.https_proxy || process.env.HTTPS_PROXY);

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
const worldId = args['world-id'];

if (!themeId || !worldId) {
  console.error('Usage: node scripts/experiment-extrapolation.js --theme <themeId> --world-id <worldId>');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const theme = loadTheme(themeId);
const world = loadWorld(themeId, worldId);
if (!world) {
  console.error(`World ${worldId} not found for theme ${themeId}. Run generate-worlds.js first.`);
  process.exit(1);
}

// --- Experimental word budget for this test only ---
const TOTAL_MIN = 500;
const TOTAL_MAX = 600;
const EXTRAPOLATION_WORDS = 150; // final ~150 of the total, reserved for the invented coda

const DEFAULT_STYLE_PRIMER = `Write literary short fiction, not an essay or a summary. Specific characters, concrete sensory detail, an ending that resonates without explaining itself. No headers, no bullet points, no analysis — flowing prose paragraphs only. The story should move through time, tracing consequences forward from the first moment toward a speculative present. The reader should feel both the plausibility of the alternative path and the strangeness of the world it produces. End on an image, not a thesis.`;

function buildFrameworkPrimer(theme) {
  const fw = theme.framework;
  if (!fw) return '';
  const parts = [];
  if (fw.lineages) {
    parts.push('Paradigms / lineages at play in this world:');
    for (const [key, desc] of Object.entries(fw.lineages)) parts.push(`- ${key}: ${desc}`);
  }
  if (fw.causal_principles?.length) {
    parts.push('\nCausal principles to respect when tracing consequences:');
    fw.causal_principles.forEach(p => parts.push(`- ${p}`));
  }
  if (fw.voice_guidance) parts.push(`\nVoice guidance: ${fw.voice_guidance}`);
  return parts.join('\n');
}

function formatWorldForPrompt(world) {
  return world.steps.map((s, i) => {
    const branch = s.chosenAlternative
      ? `\n  In this world, the path taken here: ${s.chosenAlternative.description}` +
        (s.chosenAlternative.downstreamEffects?.length
          ? `\n  Downstream consequences: ${s.chosenAlternative.downstreamEffects.join('; ')}`
          : '')
      : '';
    return `${i + 1}. [${s.date}] ${s.label}${s.category ? ` (${s.category})` : ''}\n  ${s.description}${branch}`;
  }).join('\n\n');
}

const lastStep = world.steps[world.steps.length - 1];

const systemPrompt = [
  `You are writing speculative fiction for the "${theme.config.name}" Monte Carlo narrative project.`,
  '',
  `## Your task`,
  `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world," ending at ${lastStep.label} (${lastStep.date}). Write a short story of ${TOTAL_MIN}-${TOTAL_MAX} words total that does two things in sequence:`,
  `1. For roughly the first ${TOTAL_MIN - EXTRAPOLATION_WORDS}-${TOTAL_MAX - EXTRAPOLATION_WORDS} words: dramatize the exact given path, moving through time from its first moment to its last real/counterfactual moment (${lastStep.label}, ${lastStep.date}).`,
  `2. For the final ~${EXTRAPOLATION_WORDS} words: continue PAST that last moment, roughly ten years further, into events that are NOT in the given path — invent them yourself. This invented continuation must be disciplined, not generic science fiction: it must follow specifically from (a) this world's overall trajectory — ${'{{TRAJECTORY}}'} — and (b) the named institutions, technologies, tensions, and downstream consequences already established in the path above, especially any "downstream consequences" text attached to counterfactual choices. Do not introduce a generic, unrelated future technology; extend the specific logic already in motion in this world.`,
  '',
  DEFAULT_STYLE_PRIMER,
  '',
  buildFrameworkPrimer(theme),
  '',
  `This world's overall trajectory: ${world.trajectoryDescription}.`,
  `Word count: ${TOTAL_MIN}-${TOTAL_MAX} total, with the final ~${EXTRAPOLATION_WORDS} words being the invented post-path continuation. Count carefully. Do not label or announce the transition (no "ten years later" headers) — let it read as one continuous story.`
].filter(Boolean).join('\n').replace('{{TRAJECTORY}}', world.trajectoryDescription);

const userPrompt = [
  `The chosen path through this world (ends at "${lastStep.label}", ${lastStep.date} — extrapolate past this point for the final ~${EXTRAPOLATION_WORDS} words):`,
  '',
  formatWorldForPrompt(world),
  '',
  `Write the story now. ${TOTAL_MIN}-${TOTAL_MAX} words total. Flowing prose paragraphs. No headers or lists. The last ~${EXTRAPOLATION_WORDS} words should move past "${lastStep.label}" into invented territory roughly a decade further on, grounded in this world's trajectory (${world.trajectoryDescription}) and established consequences.`
].join('\n');

console.log(`Rendering EXPERIMENTAL extrapolation variant for ${worldId}...`);
console.log(`Path ends at: ${lastStep.label} (${lastStep.date})`);
console.log(`Trajectory: ${world.trajectoryDescription}`);
console.log('');

const requestBody = JSON.stringify({
  model: theme.config.render?.model || 'claude-sonnet-5',
  max_tokens: 1600,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
  thinking: { type: 'disabled' }
});

let data;
if (USE_CURL) {
  const { execFileSync } = await import('child_process');
  const bodyPath = join(__dirname, '..', 'outputs', `.tmp-request-${Date.now()}.json`);
  writeFileSync(bodyPath, requestBody, 'utf8');
  const raw = execFileSync('curl', [
    '-s', 'https://api.anthropic.com/v1/messages',
    '-H', 'Content-Type: application/json',
    '-H', `x-api-key: ${process.env.ANTHROPIC_API_KEY}`,
    '-H', 'anthropic-version: 2023-06-01',
    '--data', `@${bodyPath}`
  ], { maxBuffer: 1024 * 1024 * 20 }).toString('utf8');
  try { execFileSync('rm', [bodyPath]); } catch {}
  data = JSON.parse(raw);
  if (data.error) {
    console.error('API error:', data.error.message);
    process.exit(1);
  }
} else {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: requestBody
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('API error:', err.error?.message || response.status);
    process.exit(1);
  }
  data = await response.json();
}
const text = data.content?.[0]?.text ?? '';
const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

console.log(`--- STORY (${wordCount} words) ---\n`);
console.log(text);

const outPath = join(__dirname, '..', 'outputs', `experiment-extrapolation-${worldId}.json`);
writeFileSync(outPath, JSON.stringify({ worldId, themeId, wordCount, systemPrompt, userPrompt, text }, null, 2), 'utf8');
console.log(`\n\nSaved full record to ${outPath}`);
