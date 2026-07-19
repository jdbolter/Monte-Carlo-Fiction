# Monte-Carlo-Fiction — agent operating manual

Read this at the start of a session. Branch `dev`.

## What this project is now

One **unified world model** for distant-writing / speculative media presents. The earlier
causal event-walking engine has been retired (it converged on reality). A World has two
ingredients — **changed dimensions + event backstory** — and is rendered into an **artifact**
by a library of forms. Full architecture in [`sampling/WORLD-CONTRACT.md`](sampling/WORLD-CONTRACT.md).

Do not reintroduce a standalone dimension-sampler-without-history or a standalone causal
forward-walk; they exist only fused, as one World.

## Layout (everything under `sampling/`)

- `media-present/dimensions.json` — dimension table; each value carries a `gloss`
  (designer-facing) and a `worldFact` (render-facing plain sentence).
- `history/vr.json`, `history/silicon-valley.json` — research-built backstory corpora (real
  events + tags). The only event source now.
- `sampler.js` — free, deterministic, seeded, k-targeted sampling + enumeration.
- `backstory.js` — selects grounding events per changed move (provisional `DIMENSION_TAG_MAP`,
  balanced across moves, recency-biased, deduped).
- `world.js` — `makeWorld(config, dims, opts)` assembles the World; `generateWorlds(...)` + CLI.
- `render-config.js` — the renderer: World → artifact. Builds the prompt from `world.facts` +
  `world.backstory`, forbids the dimension vocabulary, targets a `--form`
  (found-document / scene / testimony). Retry/backoff, `--resume`, scorecard.
- `main-server.js` + `main/` — the main app (Generate / Render / Library) on :3000.
- `server.js` + `public/` — the tuning bench (sample→render→judge) on :4000.

## Running

```
npm run world -- --k-range 1 2 --n 3 --seed 4      # generate + inspect Worlds (free)
npm run backstory -- --k 2 --seed 7                # inspect backstory selection (free)
npm run render -- --k 2 --n 1 --seed 1 --form found-document   # render (needs ANTHROPIC_API_KEY)
npm run render -- ... --dry-run                    # preview the prompt, spend nothing
npm run main                                        # main app on :3000
npm run ui                                          # tuning bench on :4000
```

World generation is free and deterministic (seed + table + corpora reproduce a World). Only
rendering costs API calls; Sonnet 529-overloads during US working hours — the renderer retries,
or pass `--model claude-haiku-4-5-20251001`.

## The render prompt — three tuning levers (in `render-config.js` `SYSTEM`)

- **tone** — no dystopian default; varied, lived-in register.
- **lineage** — backstory is deep history; never depict old technology as current.
- **grain** — world-facts are the dominant grain of the culture's media, not literal rules for
  every message (news/weather still arrive normally).

Forms live in the `FORMS` map; `found-document` is the default and the strongest anti-jargon form.

## Key docs

- `sampling/WORLD-CONTRACT.md` — the World object shape + renderer contract.
- `sampling/BACKSTORY.md` — events-as-backstory + render-form redesign (worked examples).

## Current dimension model

The table has 9 dimensions. Five are **emphasis** dimensions, whose selected value is
predominant rather than absolute: `attention_unit`, `sensory_register`, `resemblance`,
`provisioning`, and `custody`. Four are **exclusive**: `authorship_distribution`,
`literacy_floor`, `compulsion`, and `metering`. Only `resemblance` is ordered; the sampler
treats all dimensions as nominal sets.

`k` is the number of dimensions moved off ground. Enumeration currently yields 29 worlds at
k=1 and 368 at k=2. **k=1–2 is the useful coherence band**: coherence depends more on whether
the moves form a thematic bundle than on their count, and k=3 usually fragments.

## Decision log

- Dropped `fidelity_criterion` and `address`, reducing the table from 11 dimensions to 9.
- Merged overlapping values: sensory haptic + proprioceptive; provisioning ads + purchase +
  subscription; authorship caste + hereditary; and the two class-based compulsion bans.
- Renamed values that incorrectly implied exclusivity, including sensory `visual-only` and
  `auditory-only` to `visual-primary` and `auditory-primary`.
- Added the explicit emphasis/exclusive distinction to the data and render prompt.
- Retired the analytic/jargon essay as an end product. Artifact forms plus forbidden
  scaffolding vocabulary are the current anti-jargon strategy.
- Kept generated configs and costly renders out of Git; human judgments remain tracked as
  research data.

## Open threads

- **Render quality is still being tuned** (tone/lineage/grain) on the :4000 bench — the levers
  above are first-pass. The backstory `DIMENSION_TAG_MAP` and event tags are also provisional.
- **Renderers as a library**: found-document/scene/testimony are the first entries; essay,
  video/animation script, prose story come later. All consume the one World object.
- **Coherence harness**: aggregate scorecard verdicts by dimension pair to empirically test
  which combinations cohere. Sampling independence alone cannot provide this signal. Unbuilt.
- **Selection at scale**: the model rationalizes almost anything fluently, so provocative-world
  selection remains a human critical task. The complete k=2 space is bounded but still large.
- **Domain expansion**: decide whether VR is a region of the media-present table or deserves a
  theme-specific table. Silicon Valley likely fits the general table less well.
- **Dimension refinement**: values, glosses, world facts, and exclusivity remain live rather
  than frozen.

## House rules

- World generation never makes model calls; keep the free/deterministic layer clean.
- Generated worlds/renders are gitignored (reproducible or costly); judgments (`scorecard.md`)
  are tracked.
- The dimension table, world-facts, and backstory bridge are live and provisional — expect edits.
