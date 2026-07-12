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

**Layer 2 — one model call per world, costs money. Two sibling renderers, same input, different output shape:**
- `engine/render-verbal.js` renders a world as a single 400-500 word short story (continuous prose).
- `engine/render-visual.js` renders a world as a scene-by-scene animation script: one scene per milestone step, each with a `visualDirection` (a terse prompt for a future image/video generation pass) and a `narration` line (a voiceover script for a future TTS pass), plus one `styleGuide` string anchoring the whole world's visual language. Still text-only output — no image/video/audio generation exists yet; this is the structured intermediate a future visual-rendering pipeline would consume. Added 2026-07-09 as a prototype; see Known state below.

Both renderers send only that world's specific chosen path (not a full research-wiki dump — that was the old, much more expensive `VR_Speculation/api/fiction.js` pattern) plus a short generic style primer and the theme's optional `framework.json` primer, adapted per output format.

Never blur these two layers. Worldgen should never make a network call; render should never contain selection/scoring logic. Adding a new theme should never require touching any engine file — themes only supply data and config.

---

## Directory structure

```
Monte-Carlo-Fiction/
├── engine/                   shared, theme-agnostic code
│   ├── selector.js            MilestoneSelector — trajectory-vector scoring, seeded RNG, branch sampling
│   ├── theme-loader.js        reads a theme folder into { id, config, milestones, framework }
│   ├── worldgen.js            generateWorld / generateWorldBatch / save|list|loadWorld
│   ├── render-verbal.js       buildRenderPrompt / renderStory / save|list|loadStory — prose story renderer; optional { extrapolate } continues ~10y past the world's end, see Known state
│   ├── render-visual.js       buildScenePrompt / renderSceneScript / save|list|loadSceneScript — scene-script renderer (visualDirection + narration per milestone, prototype); optional { extrapolate } appends one invented scene
│   └── validate.js            diversityReport — chain diversity, repeated-ending rate, branch-choice distribution, axis stats
│
├── themes/
│   ├── _template/              copy this to add a new theme — README.md documents the full schema
│   ├── vr-immersion/           first working theme, ported from VR_Speculation (17 of its ~32 milestones)
│   └── silicon-valley/         counterfactual Silicon Valley history, 1913-2024 (28 milestones, 19 branch points)
│       ├── theme.config.json    axes, categoryField, startMilestoneId, stepsPerWorld, worldgen tuning, render model/word count
│       ├── milestones.json      the inflection-point pool
│       └── framework.json       short lineage/causal-principle primer injected into render calls
│
├── api/                       thin HTTP handlers (Vercel-handler-shaped: (req,res) => ...)
│   ├── list-themes.js          GET  — every theme under themes/ except _template
│   ├── generate-worlds.js      POST { themeId, count, startSeed? } — batch worldgen + diversity report
│   ├── render-story.js         POST { themeId, worldId } — calls the model, prose renderer
│   ├── render-scene.js         POST { themeId, worldId } — calls the model, scene-script renderer
│   ├── list-worlds.js          GET  ?theme= — saved worlds, flagged with hasStory / hasSceneScript
│   ├── list-stories.js         GET  ?theme= — saved stories
│   └── list-scenes.js          GET  ?theme= — saved scene scripts
│
├── public/                    static web frontend (vanilla JS, no build step)
│   ├── index.html              three views: theme picker, generate, library
│   ├── css/style.css
│   └── js/app.js               fetch calls into api/, renders diversity report + world cards (render story / render scenes) + reader modal (openStoryReader / openSceneReader)
│
├── server.js                  zero-dependency local dev server (Node built-ins only)
│                                serves public/, routes /api/<name> to api/<name>.js,
│                                auto-increments port on EADDRINUSE (tries up to 20 ports above the default)
│
├── scripts/                   CLI equivalents of the web UI, for batch work
│   ├── generate-worlds.js      --theme --count --start-seed — free, wraps engine/worldgen.js directly
│   ├── render-stories.js       --theme --limit --world-id — renders un-rendered worlds, wraps engine/render-verbal.js
│   └── render-scenes.js        --theme --limit --world-id — renders un-rendered scene scripts, wraps engine/render-visual.js
│
├── data/worlds/<themeId>/      generated world JSON, one file per run — gitignored (reproducible from seed)
├── outputs/stories/<themeId>/  rendered story JSON, one file per run — gitignored (not reproducible; copy out manually to keep one)
├── outputs/scenes/<themeId>/   rendered scene-script JSON, one file per run — gitignored, same reasoning as outputs/stories/
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

World generation works immediately with no setup — it's the free, deterministic layer. To render stories or scene scripts, copy `.env.local.example` to `.env.local` and set `ANTHROPIC_API_KEY`. `server.js`, `scripts/render-stories.js`, and `scripts/render-scenes.js` each read `.env.local` themselves (no dotenv dependency). `.env.local` is the deliberate convention here (not plain `.env`) to match the sibling `VR_Speculation` repo, which uses `.env.local` because it deploys via Vercel and `vercel dev` auto-loads that filename — this repo doesn't use `vercel dev`, but the naming was kept consistent across both projects anyway.

`npm run render-scenes -- --theme <id> --limit <n>` renders scene scripts from the CLI. The web UI (`npm run dev`) also has per-world "Render story" and "Render scenes" buttons on the Generate screen, and separate "Read story" / "View scenes" actions in the Library — both formats render independently per world.

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
- **No batch-render or "render all" UI action yet** — the web UI renders one world (and one format — story or scenes, chosen per click) at a time; rendering a large batch currently means clicking through each world card individually.
- **Generated data is gitignored by design.** `data/worlds/*/*` and `outputs/stories/*/*` are excluded (with `!.../\.gitkeep` exceptions so the folder structure survives a fresh clone) because worlds are deterministically reproducible from theme + seed, and stories are one-off model outputs, not source. If a specific rendered story is worth keeping/sharing, copy it out of `outputs/stories/` into a location that isn't gitignored.
- **`silicon-valley` is the first non-VR theme** (per `MONTE_CARLO_STRATEGY.md`'s "Immediate Next Steps"), added 2026-07-04. Counterfactual history of Silicon Valley from Lee de Forest's vacuum tube (1913) to the generative-AI investment surge (2024) — 28 milestones, 19 branch points, `axes: [capital, founder_power, openness, scale]`. Sourced from Michael Houck's "The Entire History of Silicon Valley" (venture-capital/company throughline) and Steve Blank's "The Secret History of Silicon Valley" (WWII/Cold War military-university origin story). `framework.json` frames the whole theme as tension between two lineages — the Terman model (military-funded, institutional, top-down) and the garage-founder model (individual risk-taking, bottom-up) — and asks render prose to let voice register whichever lineage a given world's path leans toward.
  - **Pilot batch run 2026-07-09** (`npm run generate -- --theme silicon-valley --count 20`): 100% unique milestone chains. Terminal milestone `genai-boom-2022-2024` was originally not a branch point, so 17/20 worlds converged there identically — added 2 branch alternatives to it (`incumbents-absorb-ai-boom`, `ai-boom-decentralizes-geography`) plus a second alternative each to the three other late-era branch points (`zirp-global-spread-2010s`, `kalanick-neumann-ousters-2017`, `openai-founded-2015`) in `themes/silicon-valley/milestones.json`. After the fix: 4 unique endings, 80% repeated-ending rate — still high, but 18/20 worlds landing on `genai-boom-2022-2024` is judged acceptable-by-design, since that milestone's own `notes` field frames it as the deliberate convergence point ("alternative histories converge toward or diverge from this present"). Decision: accepted, not pursued further.
  - **Found and fixed a real bug in `engine/validate.js` while investigating this**: the repeated-ending check keyed terminal worlds by `terminalProfile.milestoneId` alone, ignoring `chosenAlternative` — so two worlds that reached the same milestone but diverged into different branch content were wrongly counted as identical endings. Fixed by keying on `milestoneId::chosenAlternative.id` when the terminal step is a branch point. This affects diversity reporting for every theme, not just `silicon-valley` — worth knowing if past diversity reports (including the `vr-immersion` ~83% figure above) are revisited, since that number was measured before this fix and may shift slightly on re-run.
- **`engine/render-visual.js` is a new prototype layer, added 2026-07-09.** First step toward an eventual animation pipeline (`data/worlds/` → scene script → some future image/video/TTS generation stage, none of which exists yet). Sibling to `render-verbal.js`, not a replacement — old file renamed to `engine/render-verbal.js` in the same change to make the two-renderer split explicit. Output schema per world: `{ styleGuide, scenes: [{ milestoneId, visualDirection, narration, pacingSeconds }] }`, one scene per milestone step, in order. `visualDirection` and `narration` are deliberately separate fields (concrete/machine-facing vs. spoken/TTS-facing registers) rather than one blended paragraph, since they're expected to feed different downstream generators later. Validated against `silicon-valley-0001` and `-0002` (5/5 scenes each, correctly reflecting each world's branch alternatives, e.g. Terman staying east coast, the 1978 tax cut failing) — but only 2 worlds total, not stress-tested across a full batch or edge cases.
  - **Fixed 2026-07-10: model output is no longer parsed as raw JSON text.** The original approach (ask the model to hand-format a JSON blob, strip code fences, `JSON.parse` it) broke in production — an unescaped quote inside a `narration`/`visualDirection` string produced `Expected ':' after property name` parse errors. Replaced with a forced Anthropic tool-use call (`SCENE_TOOL` / `emit_scene_script` in `render-visual.js`, `tool_choice: { type: 'tool', name: ... }`): the API parses the structured output itself and returns `tool_use.input` as an already-valid object, so this whole class of malformed-JSON bug is no longer possible. This also surfaced a second, previously-masked bug: the per-world token budget (`render.visualMaxTokens || (800 + steps*300)`) was too tight for tool-use's more verbose output shape — responses were hitting `stop_reason: "max_tokens"` mid-array, and the API silently drops an incomplete top-level field (`scenes`) rather than erroring, which surfaced as `Expected N scenes, got 0`. Budget raised to `1500 + steps*700` (a 5-step world measures ~2250 output tokens in practice); re-validated against three worlds across both themes (`silicon-valley-0003`, `-0007`, `vr-immersion-0001`, 5/6/5 scenes respectively) with zero parse failures.
- **Web UI and `api/` wiring for scene scripts added 2026-07-09**, same day as `render-visual.js` itself. New routes `api/render-scene.js` (POST, mirrors `render-story.js`) and `api/list-scenes.js` (GET, mirrors `list-stories.js`); `api/list-worlds.js` now also flags `hasSceneScript`. Generate screen has separate "Render story" / "Render scenes" buttons per world card; Library screen has separate "Read story" / "View scenes" actions (each disabled if that format hasn't been rendered for that world) and a new `openSceneReader` reader-modal view (style guide + per-scene visual/narration blocks) alongside the existing `openStoryReader` (renamed from `openReader`). Verified end-to-end via the API directly (render, list, flag-propagation all confirmed working); the actual browser rendering of the new buttons/modal has not been visually checked in-browser, only via HTML/JS content inspection.
- **Extrapolation past a world's last milestone — prototyped 2026-07-11, promoted into the engine 2026-07-12.** The idea: after rendering a world's real/counterfactual path, continue the narrative roughly 10 years further into events the model invents itself, disciplined so it doesn't drift into generic sci-fi. First tested as a standalone one-off (`scripts/experiment-extrapolation.js`, run against `vr-immersion-0001`, saved at `outputs/experiment-extrapolation-vr-immersion-0001.json`) with a two-part system prompt: dramatize the given path, then invent a coda constrained to follow from the world's `trajectoryDescription` and the `downstream_effects` already attached to chosen branches. That test result held up on review — the invented coda picked up specifically on the world's Genie-class generative-world-model milestone rather than inventing an unrelated technology, and closed on an image that rhymed with the opening milestone (Barker's 1788 panorama). One craft issue surfaced: the model also invented new geographic settings (Lagos, Lahore) that weren't in the given path — judged undesirable, whereas inventing new named characters was judged fine.
  - **Promoted into `engine/render-verbal.js` and `engine/render-visual.js` as an opt-in `options.extrapolate` parameter** (default `false`, fully backward-compatible — existing calls with no options are unaffected). `buildRenderPrompt(theme, world, { extrapolate, extrapolationYears, extrapolationWords })` and `buildScenePrompt(theme, world, { extrapolate, extrapolationYears })` both accept it; `renderStory` / `renderSceneScript` pass it through and record `extrapolated` / `extrapolationYears` on the saved output. Defaults: 10 years, 150 words (verbal only — visual has no word budget, it appends one scene).
  - **The geography constraint from the review above is now hard-coded into the prompt itself**, alongside the pre-existing "no unrelated future technology" constraint: the invented continuation may not introduce a new geographic setting beyond what the given path already established, but new named characters are explicitly permitted. Applies to both renderers.
  - **Visual renderer shape**: extrapolation adds exactly one additional scene (not a fractional word budget, since scenes are the visual renderer's unit) with `milestoneId` set to `<lastMilestoneId>__extrapolated` and a new `isExtrapolated` boolean field (now required on every scene in `SCENE_TOOL`'s schema, `false` for real-milestone scenes). `renderSceneScript`'s token budget and scene-count validation both switched from `world.steps.length` to a `totalScenes` value that accounts for the extra scene.
  - **CLI wiring**: `node scripts/render-stories.js --theme <id> --world-id <id> --extrapolate [--extrapolation-years <n>]` and the equivalent on `scripts/render-scenes.js`. Verified by dry-running `buildRenderPrompt` / `buildScenePrompt` against `vr-immersion-0001` with `extrapolate: true` and `false` (no API calls) — confirmed the geography/character constraints only appear in extrapolate mode, the scene count instruction correctly goes from 6 to 7, and the extrapolated-scene milestoneId placeholder renders correctly. Not yet verified against a live model call with the new prompt wording (the original validated run predates this promotion and used slightly different, less constrained prompt text).
  - **Wired into `api/render-story.js`, `api/render-scene.js`, and the web UI, 2026-07-12.** Both API routes now read `extrapolate` / `extrapolationYears` off `req.body` and pass them straight through as the renderer's options object. `public/js/app.js`'s `worldCard()` (Generate screen) grew an "Extrapolate ~10y" checkbox per world card, shared between that card's "Render story" and "Render scenes" actions; it's read at click time and sent in the POST body, then disabled after the first render for that card (extrapolation, like rendering itself, only applies once — re-rendering isn't supported). The reader modal (`openStoryReader` / `openSceneReader`) shows an "extrapolated +Ny" badge in the meta line when `story.extrapolated` / `sceneScript.extrapolated` is true, the invented scene in a scene-script reader is labeled "invented continuation" in place of a date/milestone, and the Library grid's tag row appends `+Ny` to the word/scene count tag for already-rendered extrapolated items. Verified by syntax-checking all changed files and booting `server.js` to confirm `index.html`, `js/app.js`, and `/api/list-themes` still serve correctly; the checkbox's actual in-browser behavior has not been visually clicked through.
  - **Note**: `api/list-worlds.js`'s `hasStory` / `hasSceneScript` flags don't carry extrapolation info, so a world card on the Generate screen can't show whether an *already*-rendered story was extrapolated before you click into it — only the reader modal and Library screen (which load the full story/sceneScript object) can. Not fixed; low priority since the checkbox itself already goes inert after first render.
  - **`scripts/experiment-extrapolation.js` has been deleted** (2026-07-12) now that the CLI flags above supersede it. The original validated output JSON at `outputs/experiment-extrapolation-vr-immersion-0001.json` was left alone as a record of the pre-promotion prompt wording and result.

---

## Session startup checklist

1. Read this file.
2. Skim `README.md` for the quick-start commands.
3. Check `git status` / recent commits for anything in flight.
4. Ask what to work on next, unless already told.
