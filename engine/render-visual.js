// =========================================
// engine/render-visual.js — Layer 2b: single-shot scene-script rendering.
//
// Sibling to render-verbal.js, not a replacement for it. Where render-verbal.js
// turns a world into continuous prose, this turns the same world into a
// scene-by-scene animation script: one scene per milestone step, each with a
// visual direction (a prompt for a future image/video generation pass) and a
// narration line (a voiceover script for a future TTS pass), plus a per-world
// style guide so all scenes in one world share one consistent visual language.
// Still just text output — no image/video/audio is generated here. This is
// the structured intermediate a visual-rendering pipeline would consume later.
//
// Same cost/call shape as render-verbal.js: exactly one model call per world.
// =========================================

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT  = join(__dirname, '..', 'outputs', 'scenes');

const DEFAULT_STYLE_PRIMER = `You are producing a scene-by-scene animation script, not literary prose. Each milestone in the given path becomes exactly one scene. For every scene, produce two distinct pieces of text:
- "visualDirection": a terse, concrete prompt for a future image/video generation pass — setting, era-appropriate detail, composition or camera framing, the key objects/actions/people to render. Written for a machine to visualize, not for a human to read aloud.
- "narration": a voiceover line for a future text-to-speech pass — documentary narrator register, describing what happened at this milestone and why it matters. Meant to be heard, not read as fiction: clear, spoken-register sentences, not literary prose.
Also produce one "styleGuide" string for the whole world: a short persistent visual/tonal anchor (palette, era texture, recurring motif) so every scene's visualDirection reads as part of one consistent animation rather than independent images.`;

function buildFrameworkPrimer(theme) {
  const fw = theme.framework;
  if (!fw) return '';
  const parts = [];
  if (fw.lineages) {
    parts.push('Paradigms / lineages at play in this world:');
    for (const [key, desc] of Object.entries(fw.lineages)) {
      parts.push(`- ${key}: ${desc}`);
    }
  }
  if (fw.causal_principles && fw.causal_principles.length) {
    parts.push('\nCausal principles to respect when tracing consequences:');
    fw.causal_principles.forEach(p => parts.push(`- ${p}`));
  }
  if (fw.voice_guidance) {
    parts.push(`\nVoice guidance (adapt from prose to narration register): ${fw.voice_guidance}`);
  }
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
    return `${i + 1}. milestoneId="${s.milestoneId}" [${s.date}] ${s.label}${s.category ? ` (${s.category})` : ''}\n  ${s.description}${branch}`;
  }).join('\n\n');
}

function buildJsonShapeExample(world) {
  const exampleScenes = world.steps.map(s => `    { "milestoneId": "${s.milestoneId}", "visualDirection": "...", "narration": "...", "pacingSeconds": 10 }`).join(',\n');
  return `{\n  "styleGuide": "...",\n  "scenes": [\n${exampleScenes}\n  ]\n}`;
}

export function buildScenePrompt(theme, world) {
  const systemPrompt = [
    `You are writing an animation scene script for the "${theme.config.name}" Monte Carlo narrative project.`,
    '',
    `## Your task`,
    `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world." Produce exactly one scene per milestone, in the same order, translating each into a visualDirection and a narration line.`,
    '',
    DEFAULT_STYLE_PRIMER,
    '',
    buildFrameworkPrimer(theme),
    '',
    `This world's overall trajectory: ${world.trajectoryDescription}.`,
    '',
    `Respond with ONLY valid JSON, no markdown code fences, no commentary before or after. Match this exact shape, one scene per milestone in order, using the given milestoneId values exactly:`,
    buildJsonShapeExample(world)
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `The chosen path through this world:`,
    '',
    formatWorldForPrompt(world),
    '',
    `Produce the JSON scene script now. One scene per milestone, ${world.steps.length} scenes total, in order.`
  ].join('\n');

  return { systemPrompt, userPrompt };
}

function parseSceneResponse(text, world) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Model did not return valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== world.steps.length) {
    throw new Error(`Expected ${world.steps.length} scenes, got ${parsed.scenes?.length ?? 0}`);
  }
  return parsed;
}

export async function renderSceneScript(theme, world) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  }

  const { systemPrompt, userPrompt } = buildScenePrompt(theme, world);
  const render     = theme.config.render || {};
  const model      = render.model || 'claude-sonnet-5';
  // Structured per-scene output (visual direction + narration + style guide
  // for every milestone) runs longer than the single continuous story
  // render.maxTokens is tuned for, so this layer sizes its own budget off
  // step count instead of reusing that value.
  const maxTokens  = render.visualMaxTokens || (800 + world.steps.length * 300);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
      thinking:   { type: 'disabled' }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';
  const { styleGuide, scenes } = parseSceneResponse(text, world);

  return {
    worldId:    world.worldId,
    themeId:    theme.id,
    model,
    styleGuide,
    scenes,
    renderedAt: new Date().toISOString()
  };
}

// --- Persistence ---

export function saveSceneScript(sceneScript) {
  const dir = join(OUT_ROOT, sceneScript.themeId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sceneScript.worldId}.json`);
  writeFileSync(path, JSON.stringify(sceneScript, null, 2), 'utf8');
  return path;
}

export function listSceneScripts(themeId) {
  const dir = join(OUT_ROOT, themeId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export function loadSceneScript(themeId, worldId) {
  const path = join(OUT_ROOT, themeId, `${worldId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}
