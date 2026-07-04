# Monte-Carlo-Fiction — Agent Instructions

This file is the operating manual for an LLM agent working on this repo. Read it at the start of every session. Keep it current — when the architecture changes, update this file in the same turn.

---

## What this project is

A testbed for generating a large run (>99) of narratives that vary on a shared theme, so the resulting set can be read and analyzed as a batch rather than one story at a time. See `MONTE_CARLO_STRATEGY.md` for the original design rationale (JSON-first world state, Monte Carlo sampling over a milestone pool, a validated world set before spending money on prose).

This is a sibling project to `/Users/jaybolter/Documents/GitHub/VR_Speculation` and its Obsidian vault at `/Users/jaybolter/Documents/VR-Speculation` — several techniques here (the trajectory-vector milestone selector, the single-shot prose-rendering call) were adapted from that project's `pastcasting` and `fiction` tools, but reworked to run headlessly and cheaply across many runs instead of one live user session.

---

## Architecture: two layers, kept strictly separate

**Layer 1 — `engine/worldgen.js` (structured, free, fast, no model calls).**
Walks a theme's milestone pool and produces a "world": an ordered sequence of milestones plus, at every branch point, one sampled `branch_alternative` locking in what happened in that world. Uses a seeded RNG (`engine/selector.js`, `makeRng`) so a given seed always reproduces the same world — this is why generated worlds are gitignored (see below): they can always be regenerated on demand from theme + seed.

**Layer 2 — `engine/render.js` (one model call per world, costs money).**
Takes one saved world and renders it as a 400-500 word short story. The prompt sends only that world's specific chosen path (not a full research-wiki dump — that was the old, much more expensive `VR_Speculation/api/fiction.js` pattern) plus a short generic style primer and the theme's optional `framework.json` primer.

Never blur these two layers. Worldgen should never make a network call; render should never contain selection/scoring logic. Adding a new theme should never require touching either engine file — themes only supply data and config.

---

## Directory structure

```
Monte-Carlo-Fiction/
├── engine/                   shared, theme-agnostic code
│   ├── selector.js            MilestoneSelector — trajectory-vector scoring, seeded RNG, branch sampling
│   ├── theme-loader.js        reads a theme folder into { id, config, milestones, framework }
│   ├── worldgen.js            generateWorld / generateWorldBatch / save|list|loadWorld
│   ├── render.js               buildRenderPrompt / renderStory / save|list|loadStory
│   └── validate.js            diversityReport — chain diversity, repeated-ending rate, branch-choice distribution, axis stats
│
├── themes/
│   ├── _template/              copy this to add a new theme — README.md documents the full schema
│   └── vr-immersion/           first working theme, ported from VR_Speculation (17 of its ~32 milestones)
│       ├── theme.config.json    axes, categoryField, startMilestoneId, stepsPerWorld, worldgen tuning, render model/word count
│       ├── milestones.json      the inflection-point pool
│       └── framework.json       short lineage/causal-principle primer injected into render calls
│
├── api/                       thin HTTP handlers (Vercel-handler-shaped: (req,res) => ...)
│   ├── list-themes.js          GET  — every theme under themes/ except _template
│   ├── generate-worlds.js      POST { themeId, count, startSeed? } — batch worldgen + diversity report
│   ├── render-story.js         POST { themeId, worldId } — the only route that calls the model
│   ├── list-worlds.js          GET  ?theme= — saved worlds, flagged with hasStory
│   └── list-stories.js         GET  ?theme= — saved stories
│
├── public/                    static web frontend (vanilla JS, no build step)
│   ├── index.html              three views: theme picker, generate, library
│   ├── css/style.css
│   └── js/app.js               fetch calls into api/, renders diversity report + world/story cards + reader modal
│
├── server.js                  zero-dependency local dev server (Node built-ins only)
│                                serves public/, routes /api/<name> to api/<name>.js,
│                                auto-increments port on EADDRINUSE (tries up to 20 ports above the default)
│
├── scripts/                   CLI equivalents of the web UI, for batch work
│   ├── generate-worlds.js      --theme --count --start-seed — free, wraps engine/worldgen.js directly
│   └── render-stories.js       --theme --limit --world-id — renders un-rendered worlds, wraps engine/render.js
│
├── data/worlds/<themeId>/      generated world JSON, one file per run — gitignored (reproducible from seed)
├── outputs/stories/<themeId>/  rendered story JSON, one file per run — gitignored (not reproducible; copy out manually to keep one)
│
├── MONTE_CARLO_STRATEGY.md    original design doc / phase plan
├── README.md                  quick-start + architecture summary
└── CLAUDE.md                  this file
```

---

## Running it

```
npm run dev
```

No `npm install` needed — `server.js` and everything under `engine/`/`api/` use only Node built-ins (`fetch` is global in Node ≥18). Starts at `http://localhost:3000`; if that port is taken, it automatically tries higher ports (up to 20 above) and prints which one it landed on.

World generation works immediately with no setup — it's the free, deterministic layer. To render stories, copy `.env.local.example` to `.env.local` and set `ANTHROPIC_API_KEY`. `server.js` and `scripts/render-stories.js` each read `.env.local` themselves (no dotenv dependency). `.env.local` is the deliberate convention here (not plain `.env`) to match the sibling `VR_Speculation` repo, which uses `.env.local` because it deploys via Vercel and `vercel dev` auto-loads that filename — this repo doesn't use `vercel dev`, but the naming was kept consistent across both projects anyway.

---

## Theme schema (see `themes/_template/README.md` for the authoritative version)

- **`theme.config.json`** — `axes` (3-5 trajectory dimension names meaningful to that theme's tensions), `categoryField` (default `"category"`), `startMilestoneId`, `stepsPerWorld`, `worldgen` tuning (`topN`, `branchPointBonus`, `crossCategoryBonusEvery`), `render` (model, maxTokens, minWords/maxWords).
- **`milestones.json`** — array of inflection points: `id`, `date`, `label`, `description`, `category`, `is_branch_point`, `trajectory_contribution` (keyed by that theme's `axes`). Branch points additionally carry `branch_alternatives` (`id`, `description`, `plausibility`, `requirement`, `downstream_effects`) and optionally `era_constraints` (`available`/`not_available`, used only for prose plausibility, not scoring).
- **`framework.json`** (optional) — `lineages`, `causal_principles`, `voice_guidance`. Kept deliberately short; this is not a place to paste a full research wiki.

Adding a theme: copy `themes/_template/` to `themes/<new-id>/`, edit the three files. No registration step — `engine/theme-loader.js` discovers every folder under `themes/` except those starting with `_`.

---

## Known state / open items

- **`vr-immersion` is a partial port** (17 of the source project's ~32 milestones) — good enough to validate the engine, not a finished theme. A test batch surfaced a real diversity problem worth knowing about: too few milestones/branch points after ~2012 causes ~83% of worlds to converge on the same terminal milestone (Apple Vision Pro 2024). Fix is adding more late-era branch points, not a code bug — `engine/validate.js`'s `repeatedEndingFlag` correctly caught this.
- **No character-simulation layer yet** (`MONTE_CARLO_STRATEGY.md` Phase 5/6 — running characters through validated worlds, then cross-layer analysis). Only world generation and single-world prose rendering exist so far.
- **No batch-render or "render all" UI action yet** — the web UI renders one world at a time; rendering a large batch currently means clicking through each world card individually.
- **Generated data is gitignored by design.** `data/worlds/*/*` and `outputs/stories/*/*` are excluded (with `!.../\.gitkeep` exceptions so the folder structure survives a fresh clone) because worlds are deterministically reproducible from theme + seed, and stories are one-off model outputs, not source. If a specific rendered story is worth keeping/sharing, copy it out of `outputs/stories/` into a location that isn't gitignored.
- **No new theme has been designed yet beyond vr-immersion.** Picking a first non-VR theme (per `MONTE_CARLO_STRATEGY.md`'s "Immediate Next Steps") is still open.

---

## Session startup checklist

1. Read this file.
2. Skim `README.md` for the quick-start commands.
3. Check `git status` / recent commits for anything in flight.
4. Ask what to work on next, unless already told.
