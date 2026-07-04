// =========================================
// engine/render.js — Layer 2: single-shot prose rendering.
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

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT  = join(__dirname, '..', 'outputs', 'stories');

const DEFAULT_STYLE_PRIMER = `Write literary short fiction, not an essay or a summary. Specific characters, concrete sensory detail, an ending that resonates without explaining itself. No headers, no bullet points, no analysis — flowing prose paragraphs only. The story should move through time, tracing consequences forward from the first moment toward a speculative present. The reader should feel both the plausibility of the alternative path and the strangeness of the world it produces. End on an image, not a thesis.`;

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

export function buildRenderPrompt(theme, world) {
  const render = theme.config.render || {};
  const minWords = render.minWords || 400;
  const maxWords = render.maxWords || 500;

  const systemPrompt = [
    `You are writing speculative fiction for the "${theme.config.name}" Monte Carlo narrative project.`,
    '',
    `## Your task`,
    `You will be given a specific chosen path through a sequence of real and counterfactual moments — a "world." Write a short story (${minWords}-${maxWords} words) that dramatizes this exact path, moving through time from its first moment toward its terminal moment.`,
    '',
    DEFAULT_STYLE_PRIMER,
    '',
    buildFrameworkPrimer(theme),
    '',
    `This world's overall trajectory: ${world.trajectoryDescription}.`,
    `Word count: ${minWords}-${maxWords}. Not fewer, not more. Count carefully.`
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `The chosen path through this world:`,
    '',
    formatWorldForPrompt(world),
    '',
    `Write the story now. ${minWords}-${maxWords} words. Flowing prose paragraphs. No headers or lists.`
  ].join('\n');

  return { systemPrompt, userPrompt };
}

export async function renderStory(theme, world) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  }

  const { systemPrompt, userPrompt } = buildRenderPrompt(theme, world);
  const render = theme.config.render || {};
  const model     = render.model     || 'claude-sonnet-5';
  const maxTokens = render.maxTokens || 1300;

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
  const text = data.content?.[0]?.text ?? '';

  return {
    worldId:   world.worldId,
    themeId:   theme.id,
    model,
    text,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
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
