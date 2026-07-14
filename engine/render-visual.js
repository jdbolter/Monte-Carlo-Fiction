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

// --- Extrapolation (optional, off by default) ---
// Sibling to the extrapolation option in render-verbal.js — same discipline,
// adapted to the scene-script shape: instead of a prose coda, one additional
// invented scene is appended past the world's last real/counterfactual
// milestone. Same two hard constraints: no unrelated future technology
// (extend the path's established downstream_effects instead), and no new
// geographic setting beyond what the path already established. New named
// characters are fine to invent for that scene.
const DEFAULT_EXTRAPOLATION_YEARS = 10;

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
        (s.chosenAlternative.requirement
          ? `\n  What made this plausible: ${s.chosenAlternative.requirement}`
          : '') +
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
// Built per-call (not a static constant) because minItems/maxItems must be
// pinned to this specific world's totalScenes — without a hard array-length
// bound, a generous max_tokens budget (needed to avoid the truncation bug
// above) gives a degenerate model response room to loop and emit far more
// scene objects than the world has steps, e.g. "expected 6, got 60+".
function buildSceneTool(totalScenes) {
  return {
    name: 'emit_scene_script',
    description: `Emit the completed scene-by-scene animation script for this world. The scenes array must contain exactly ${totalScenes} items — no more, no fewer.`,
    input_schema: {
      type: 'object',
      properties: {
        styleGuide: {
          type: 'string',
          description: "A short persistent visual/tonal anchor (palette, era texture, recurring motif) for the whole world, so every scene's visualDirection reads as part of one consistent animation."
        },
        scenes: {
          type: 'array',
          description: `Exactly ${totalScenes} scenes, one per milestone, in the same order as the given path.`,
          minItems: totalScenes,
          maxItems: totalScenes,
          items: {
            type: 'object',
            properties: {
              milestoneId:     { type: 'string', description: 'Must exactly match the milestoneId given for this step. For an invented extrapolation scene (only present when instructed), use the given extrapolated milestoneId placeholder exactly.' },
              visualDirection: { type: 'string', description: 'Terse, concrete prompt for a future image/video generation pass — setting, era-appropriate detail, composition/framing, key objects/actions/people. Written for a machine to visualize.' },
              narration:       { type: 'string', description: 'A voiceover line for a future text-to-speech pass — documentary narrator register, spoken sentences, not literary prose.' },
              pacingSeconds:   { type: 'integer', description: 'Approximate on-screen duration for this scene, in seconds.' },
              isExtrapolated:  { type: 'boolean', description: 'True only for the one invented scene that continues past the world\'s last given milestone; false for every scene that corresponds to a given milestone.' }
            },
            required: ['milestoneId', 'visualDirection', 'narration', 'pacingSeconds', 'isExtrapolated']
          }
        }
      },
      required: ['styleGuide', 'scenes']
    }
  };
}

export function buildScenePrompt(theme, world, options = {}) {
  const extrapolate = !!options.extrapolate;
  const extrapolationYears = options.extrapolationYears ?? theme.config.render?.extrapolationYears ?? DEFAULT_EXTRAPOLATION_YEARS;
  const lastStep = world.steps[world.steps.length - 1];
  const extrapolatedMilestoneId = `${lastStep.milestoneId}__extrapolated`;
  const totalScenes = world.steps.length + (extrapolate ? 1 : 0);

  const taskLine = extrapolate
    ? `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world," ending at ${lastStep.label} (${lastStep.date}). Produce one scene per given milestone, in order (isExtrapolated: false, milestoneId matching exactly), PLUS one additional final scene that you invent: a continuation roughly ${extrapolationYears} years past ${lastStep.label}. This invented scene must be disciplined, not generic science fiction: it must follow specifically from this world's overall trajectory and the named institutions, technologies, tensions, and downstream consequences already established in the path above. Do not introduce a generic, unrelated future technology, and do not introduce a new geographic setting beyond what's already established in the given path — extend the specific logic, institutions, and places already in motion. Inventing new named characters for this final scene is fine. Set that final scene's milestoneId to exactly "${extrapolatedMilestoneId}" and isExtrapolated to true.`
    : `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world." Produce exactly one scene per milestone, in the same order, translating each into a visualDirection and a narration line. Set isExtrapolated to false for every scene.`;

  const systemPrompt = [
    `You are writing an animation scene script for the "${theme.config.name}" Monte Carlo narrative project.`,
    '',
    `## Your task`,
    taskLine,
    '',
    DEFAULT_STYLE_PRIMER,
    '',
    buildFrameworkPrimer(theme),
    '',
    `This world's overall trajectory: ${world.trajectoryDescription}.`,
    '',
    extrapolate
      ? `Call emit_scene_script with exactly ${totalScenes} scenes: ${world.steps.length} from the given path (in order, using the given milestoneId values exactly) plus 1 invented extrapolation scene last (milestoneId "${extrapolatedMilestoneId}").`
      : `Call emit_scene_script with exactly ${totalScenes} scenes, one per milestone in order, using the given milestoneId values exactly.`
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `The chosen path through this world${extrapolate ? ` (ends at "${lastStep.label}", ${lastStep.date} — add one invented extrapolation scene roughly ${extrapolationYears} years past this point)` : ''}:`,
    '',
    formatWorldForPrompt(world),
    '',
    extrapolate
      ? `Call emit_scene_script now. ${world.steps.length} scenes for the given path, in order, plus 1 final invented extrapolation scene (milestoneId "${extrapolatedMilestoneId}", isExtrapolated true) continuing roughly ${extrapolationYears} years past "${lastStep.label}", grounded in this world's trajectory (${world.trajectoryDescription}) and established consequences. Do not introduce a new geographic setting in that scene; inventing new named characters is fine. ${totalScenes} scenes total.`
      : `Call emit_scene_script now. One scene per milestone, ${totalScenes} scenes total, in order.`
  ].join('\n');

  return { systemPrompt, userPrompt };
}

export async function renderSceneScript(theme, world, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  }

  const extrapolate = !!options.extrapolate;
  const extrapolationYears = options.extrapolationYears ?? theme.config.render?.extrapolationYears ?? DEFAULT_EXTRAPOLATION_YEARS;
  const totalScenes = world.steps.length + (extrapolate ? 1 : 0);
  const { systemPrompt, userPrompt } = buildScenePrompt(theme, world, options);
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
  const maxTokens  = render.visualMaxTokens || (1500 + totalScenes * 700);

  // Retry loop, fixed 2026-07-14. Despite input_schema declaring "scenes" as
  // an array, the model sometimes emits it as a JSON-encoded string instead
  // of a nested structure (tool_choice forces the overall tool_use call to
  // be well-formed, but doesn't force every field to stay unstringified) —
  // the likely real explanation for earlier "expected 6, got 60+"-shaped
  // reports, since scenes.length on a string measures characters, not scene
  // count. Worse: when the model does this, it's effectively hand-typing
  // JSON into that string the same way the pre-tool-use approach did, and
  // reintroduces that exact class of typo (observed live: a stray `;` where
  // a `,` was needed, and a full-width `：` in place of `:`), producing a
  // string that doesn't even parse. Measured live across 9 calls for the
  // same world: 4 clean arrays, 2 parseable strings, 3 unparseable strings —
  // roughly 1-in-3 raw failure rate. A retry is justified because this is
  // per-call model stochasticity, not a deterministic prompt/schema defect:
  // the failure probability compounds across attempts (~33% chance all 3
  // fail if each attempt is independent).
  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
        tools:       [buildSceneTool(totalScenes)],
        tool_choice: { type: 'tool', name: 'emit_scene_script' }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
    }

    const data = await response.json();
    // Direct signal instead of inferring truncation after the fact from a
    // scene-count mismatch — same check added to render-verbal.js for prose.
    // Not retried: a too-tight maxTokens budget is a deterministic config
    // problem, not stochastic model behavior, so retrying would likely just
    // fail the same way again.
    if (data.stop_reason === 'max_tokens') {
      throw new Error(`Scene script was truncated (hit max_tokens=${maxTokens}) before finishing — expected ${totalScenes} scenes.`);
    }
    const toolUse = data.content?.find(c => c.type === 'tool_use');
    if (!toolUse) {
      lastError = new Error('Model did not return a tool_use block for emit_scene_script');
      continue;
    }
    const { styleGuide } = toolUse.input;
    let scenes = toolUse.input.scenes;
    if (typeof scenes === 'string') {
      try {
        scenes = JSON.parse(scenes);
      } catch {
        lastError = new Error(`Model returned "scenes" as a string that was not valid JSON (attempt ${attempt}/${maxAttempts}).`);
        continue;
      }
    }
    if (!Array.isArray(scenes) || scenes.length !== totalScenes) {
      lastError = new Error(`Expected ${totalScenes} scenes, got ${scenes?.length ?? 0} (attempt ${attempt}/${maxAttempts}).`);
      continue;
    }

    return {
      worldId:    world.worldId,
      themeId:    theme.id,
      model,
      styleGuide,
      scenes,
      extrapolated: extrapolate,
      extrapolationYears: extrapolate ? extrapolationYears : undefined,
      renderedAt: new Date().toISOString()
    };
  }

  throw lastError;
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
