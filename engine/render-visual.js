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

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
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

// Forcing a tool call (rather than asking the model to hand-format a JSON
// blob in plain text) means the Anthropic API itself is responsible for
// producing syntactically valid JSON for tool_use.input — we get back a
// parsed object, not text we have to regex-strip and JSON.parse ourselves.
// The earlier plain-text-JSON approach broke in practice whenever narration
// or visualDirection prose contained an unescaped quote.
const SCENE_TOOL = {
  name: 'emit_scene_script',
  description: 'Emit the completed scene-by-scene animation script for this world.',
  input_schema: {
    type: 'object',
    properties: {
      styleGuide: {
        type: 'string',
        description: "A short persistent visual/tonal anchor (palette, era texture, recurring motif) for the whole world, so every scene's visualDirection reads as part of one consistent animation."
      },
      scenes: {
        type: 'array',
        description: 'One scene per milestone, in the same order as the given path.',
        items: {
          type: 'object',
          properties: {
            milestoneId:     { type: 'string', description: 'Must exactly match the milestoneId given for this step.' },
            visualDirection: { type: 'string', description: 'Terse, concrete prompt for a future image/video generation pass — setting, era-appropriate detail, composition/framing, key objects/actions/people. Written for a machine to visualize.' },
            narration:       { type: 'string', description: 'A voiceover line for a future text-to-speech pass — documentary narrator register, spoken sentences, not literary prose.' },
            pacingSeconds:   { type: 'integer', description: 'Approximate on-screen duration for this scene, in seconds.' }
          },
          required: ['milestoneId', 'visualDirection', 'narration', 'pacingSeconds']
        }
      }
    },
    required: ['styleGuide', 'scenes']
  }
};

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
    `Call emit_scene_script with exactly ${world.steps.length} scenes, one per milestone in order, using the given milestoneId values exactly.`
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `The chosen path through this world:`,
    '',
    formatWorldForPrompt(world),
    '',
    `Call emit_scene_script now. One scene per milestone, ${world.steps.length} scenes total, in order.`
  ].join('\n');

  return { systemPrompt, userPrompt };
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
  // step count instead of reusing that value. The forced tool-use call for
  // emit_scene_script (see SCENE_TOOL) needs noticeably more headroom than
  // plain prose: a 5-step silicon-valley world measured ~2250 output tokens
  // in practice, and a too-tight budget causes the response to hit
  // stop_reason "max_tokens" mid-array — the API then silently drops the
  // incomplete "scenes" field entirely, which surfaced as a scene-count
  // mismatch even though the tool_use JSON itself was well-formed.
  const maxTokens  = render.visualMaxTokens || (1500 + world.steps.length * 700);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens:  maxTokens,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userPrompt }],
      thinking:    { type: 'disabled' },
      tools:       [SCENE_TOOL],
      tool_choice: { type: 'tool', name: SCENE_TOOL.name }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
  }

  const data = await response.json();
  const toolUse = data.content?.find(c => c.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Model did not return a tool_use block for emit_scene_script');
  }
  const { styleGuide, scenes } = toolUse.input;
  if (!Array.isArray(scenes) || scenes.length !== world.steps.length) {
    throw new Error(`Expected ${world.steps.length} scenes, got ${scenes?.length ?? 0}`);
  }

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

// Deletes every rendered scene script for a theme (not the worlds themselves).
// Leaves .gitkeep alone so the folder survives in git. Returns count deleted.
export function clearSceneScripts(themeId) {
  const dir = join(OUT_ROOT, themeId);
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  files.forEach(f => unlinkSync(join(dir, f)));
  return files.length;
}
