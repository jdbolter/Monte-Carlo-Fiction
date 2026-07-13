// =========================================
// engine/render-verbal.js — Layer 2: single-shot prose rendering.
//
// Takes one structured world (from worldgen.js) and makes exactly one
// call to the model to render it as a short story. This is the only
// place in the engine that spends tokens or costs money — worldgen
// itself is free and can be run hundreds of times before you decide
// which worlds are worth rendering.
//
// Prompt design deliberately does NOT dump an entire knowledge base
// (contrast with the old fiction.js pattern, which injected a ~4,000
// word wiki page into every call). Instead it sends only the specific
// chosen path through this world's milestones, plus a short generic
// framework primer from the theme's framework.json. Much smaller
// prompt, much cheaper per story, and the causal chain is auditable
// because it's the same JSON that's saved to data/worlds/.
// =========================================

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT  = join(__dirname, '..', 'outputs', 'stories');

const DEFAULT_STYLE_PRIMER = `Write literary short fiction, not an essay or a summary. Specific characters, concrete sensory detail, an ending that resonates without explaining itself. No headers, no bullet points, no analysis — flowing prose paragraphs only. The story should move through time, tracing consequences forward from the first moment toward a speculative present. The reader should feel both the plausibility of the alternative path and the strangeness of the world it produces. End on an image, not a thesis.`;

// --- Extrapolation (optional, off by default) ---
// Promoted from scripts/experiment-extrapolation.js after a single validated
// test run against vr-immersion-0001. When enabled, the final portion of the
// story continues past the world's last real/counterfactual milestone into
// invented territory roughly extrapolationYears further on. Disciplined by
// two hard constraints so the coda doesn't drift into generic sci-fi: (1) no
// unrelated future technology — extend the logic already established in the
// path's downstream_effects, and (2) no new geographic settings beyond what
// the path already established. New named characters are explicitly fine —
// only the invented technology and the invented geography are constrained.
const DEFAULT_EXTRAPOLATION_YEARS = 10;
const DEFAULT_EXTRAPOLATION_WORDS = 150;

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
    parts.push(`\nVoice guidance: ${fw.voice_guidance}`);
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
    return `${i + 1}. [${s.date}] ${s.label}${s.category ? ` (${s.category})` : ''}\n  ${s.description}${branch}`;
  }).join('\n\n');
}

export function buildRenderPrompt(theme, world, options = {}) {
  const render = theme.config.render || {};
  const minWords = render.minWords || 400;
  const maxWords = render.maxWords || 500;
  const extrapolate = !!options.extrapolate;
  const extrapolationYears = options.extrapolationYears ?? render.extrapolationYears ?? DEFAULT_EXTRAPOLATION_YEARS;
  const extrapolationWords = options.extrapolationWords ?? render.extrapolationWords ?? DEFAULT_EXTRAPOLATION_WORDS;
  const lastStep = world.steps[world.steps.length - 1];

  const taskLines = extrapolate
    ? [
        `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world," ending at ${lastStep.label} (${lastStep.date}). Write a short story of ${minWords}-${maxWords} words total that does two things in sequence:`,
        `1. For roughly the first ${minWords - extrapolationWords}-${maxWords - extrapolationWords} words: dramatize the exact given path, moving through time from its first moment to its last real/counterfactual moment (${lastStep.label}, ${lastStep.date}).`,
        `2. For the final ~${extrapolationWords} words: continue PAST that last moment, roughly ${extrapolationYears} years further, into events that are NOT in the given path — invent them yourself. This invented continuation must be disciplined, not generic science fiction: it must follow specifically from (a) this world's overall trajectory — ${world.trajectoryDescription} — and (b) the named institutions, technologies, tensions, and downstream consequences already established in the path above, especially any "downstream consequences" text attached to counterfactual choices. Do not introduce a generic, unrelated future technology, and do not introduce a new geographic setting beyond what's already established in the given path — extend the specific logic, institutions, and places already in motion in this world. Inventing new named characters for this continuation is fine.`
      ]
    : [
        `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world." Write a short story (${minWords}-${maxWords} words) that dramatizes this exact path, moving through time from its first moment toward its terminal moment.`
      ];

  const systemPrompt = [
    `You are writing speculative fiction for the "${theme.config.name}" Monte Carlo narrative project.`,
    '',
    `## Your task`,
    ...taskLines,
    '',
    DEFAULT_STYLE_PRIMER,
    '',
    buildFrameworkPrimer(theme),
    '',
    `This world's overall trajectory: ${world.trajectoryDescription}.`,
    extrapolate
      ? `Word count: ${minWords}-${maxWords} total, with the final ~${extrapolationWords} words being the invented post-path continuation. Count carefully. Do not label or announce the transition (no "ten years later" headers) — let it read as one continuous story.`
      : `Word count: ${minWords}-${maxWords}. Not fewer, not more. Count carefully.`
  ].filter(Boolean).join('\n');

  const userPrompt = extrapolate
    ? [
        `The chosen path through this world (ends at "${lastStep.label}", ${lastStep.date} — extrapolate past this point for the final ~${extrapolationWords} words):`,
        '',
        formatWorldForPrompt(world),
        '',
        `Write the story now. ${minWords}-${maxWords} words total. Flowing prose paragraphs. No headers or lists. The last ~${extrapolationWords} words should move past "${lastStep.label}" into invented territory roughly ${extrapolationYears} years further on, grounded in this world's trajectory (${world.trajectoryDescription}) and established consequences. Do not introduce a new geographic setting; inventing new named characters is fine.`
      ].join('\n')
    : [
        `The chosen path through this world:`,
        '',
        formatWorldForPrompt(world),
        '',
        `Write the story now. ${minWords}-${maxWords} words. Flowing prose paragraphs. No headers or lists.`
      ].join('\n');

  return { systemPrompt, userPrompt };
}

export async function renderStory(theme, world, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  }

  const extrapolate = !!options.extrapolate;
  const extrapolationYears = options.extrapolationYears ?? theme.config.render?.extrapolationYears ?? DEFAULT_EXTRAPOLATION_YEARS;
  const { systemPrompt, userPrompt } = buildRenderPrompt(theme, world, options);
  const render = theme.config.render || {};
  const model     = render.model     || 'claude-sonnet-5';
  const maxTokens = render.maxTokens || 1300;
  // Extrapolation is carved out of this same minWords-maxWords total (see
  // buildRenderPrompt's taskLines), not additive on top of it — the coda
  // replaces the story's last ~extrapolationWords, it doesn't extend the
  // budget — so the runaway-length check below uses these unmodified.
  const minWords  = render.minWords || 400;
  const maxWords  = render.maxWords || 500;

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
      // Sonnet 5 turns on adaptive thinking by default for any request that
      // doesn't set `thinking`, and max_tokens is a hard cap on thinking +
      // response combined. This is a straightforward creative-writing call
      // with no reasoning need, so disable it — keeps the full token budget
      // going to story text and matches the old no-thinking Sonnet 4.6
      // behavior. If a theme configures an older/different model that
      // rejects this field, remove it for that theme.
      thinking: { type: 'disabled' }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
  }

  const data = await response.json();
  // A truncated response (hit the max_tokens cap mid-sentence) is the prose
  // equivalent of the scene-script truncation bug in render-visual.js — the
  // difference is prose has no array length to catch it by, so it has to be
  // checked directly via stop_reason instead of inferred after the fact.
  if (data.stop_reason === 'max_tokens') {
    throw new Error(`Story was truncated (hit max_tokens=${maxTokens}) before finishing — the model likely ran on far past the requested ${minWords}-${maxWords} word count.`);
  }
  const text = data.content?.[0]?.text ?? '';
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  // Runaway-length guard, symmetric to the scenes-array minItems/maxItems
  // cap: catches a story that finished cleanly (no max_tokens truncation)
  // but still blew well past the requested word count.
  const maxAllowedWords = Math.round(maxWords * 1.5);
  if (wordCount > maxAllowedWords) {
    throw new Error(`Story ran away: requested ${minWords}-${maxWords} words, model produced ${wordCount}.`);
  }

  return {
    worldId:   world.worldId,
    themeId:   theme.id,
    model,
    text,
    wordCount,
    extrapolated: extrapolate,
    extrapolationYears: extrapolate ? extrapolationYears : undefined,
    renderedAt: new Date().toISOString()
  };
}

// --- Persistence ---

export function saveStory(story) {
  const dir = join(OUT_ROOT, story.themeId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${story.worldId}.json`);
  writeFileSync(path, JSON.stringify(story, null, 2), 'utf8');
  return path;
}

export function listStories(themeId) {
  const dir = join(OUT_ROOT, themeId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

export function loadStory(themeId, worldId) {
  const path = join(OUT_ROOT, themeId, `${worldId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Deletes every rendered story for a theme (not the worlds themselves).
// Leaves .gitkeep alone so the folder survives in git. Returns count deleted.
export function clearStories(themeId) {
  const dir = join(OUT_ROOT, themeId);
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  files.forEach(f => unlinkSync(join(dir, f)));
  return files.length;
}
