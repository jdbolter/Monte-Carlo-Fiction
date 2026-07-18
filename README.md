# Monte-Carlo-Fiction — the world model

*Experimental branch `dev-claude-redesign`. This branch replaced the earlier causal
event-walking engine with a single unified world model. Everything lives under
[`sampling/`](sampling/).*

## The idea

There is **one world model**, and it has two ingredients:

1. **Changed dimensions** — what is different about this present. A configuration over a
   table of media-present dimensions (attention, sensory register, resemblance, authorship,
   provisioning, custody, literacy, compulsion, metering), where some values differ from
   their real-world "ground" value. A seeded RNG samples these, so difference is guaranteed
   and escapes our priors.
2. **Event backstory** — the real historical events that ground those changes, selected from
   two research-built corpora (immersive-media history and Silicon-Valley/computing history)
   because they resonate with the changed dimensions.

A **World** = changed dimensions + event backstory, plus a plain-language `facts` list the
renderer must honor. Neither half is produced alone. This permanently avoids the old engine's
problem of converging on reality: difference comes from the dimensions, grounding from events.

`world = changed dimensions + event backstory → rendered as an artifact.`

## Two interfaces

- **Main app — `npm run main` → http://localhost:3000.** Three tabs: **Generate** worlds
  (free), **Render** them into artifacts (needs an API key), **Library** to read and judge
  (cohere / strain / incoherent). This is the primary interface.
- **Tuning bench — `npm run ui` → http://localhost:4000.** A single-page sample→render→judge
  tool for iterating on prompts and dimensions. Same underlying renderer as the main app.

## Command line (free unless noted)

```
npm run world -- --k-range 1 2 --n 3 --seed 4      # generate + inspect Worlds
npm run world -- --k 2 --n 3 --seed 4 --save       # also save to sampling/worlds/
npm run sample -- --k 2 --n 8                       # just the sampled configurations
npm run backstory -- --k 2 --seed 7                # backstory selection, with reasons
npm run render -- --k 2 --n 5 --seed 1 --form found-document          # render (needs API key)
npm run render -- --k-range 1 2 --n 6 --seed 7 --form scene --dry-run # preview prompt, free
```

## Rendering

A renderer consumes a **World** and writes an **artifact**, not an essay. It builds the
prompt from `world.facts` (plain sentences) + `world.backstory` (real events as lineage),
forbids the dimension vocabulary, and targets a **form**:

- `found-document` (recommended default — hardest to lapse into analysis), `scene`, `testimony`.

Three tuning levers live in the `SYSTEM` string of `sampling/render-config.js`: **tone** (no
dystopian default; varied register), **lineage** (backstory is deep history — never depict old
tech as current), and **grain** (facts are the dominant grain of the culture's media, not
literal rules for every message). API overload (Sonnet 529s during US hours) is handled by
retry/backoff, or pass `--model claude-haiku-4-5-20251001`.

## Where things are

```
sampling/
├── media-present/dimensions.json   dimension table + per-value gloss & worldFact (compile-time artifact)
├── history/vr.json                 immersive-media backstory corpus (~68 events, 1600s–2026)
├── history/silicon-valley.json     computing/capital backstory corpus (~56 events, 1909–2024)
├── sampler.js                      free, deterministic k-targeted sampling / enumeration
├── backstory.js                    selects grounding events per changed move
├── world.js                        makeWorld() — assembles the unified World object  ← the model
├── render-config.js                the renderer: World → artifact (forms, retry, scorecard)
├── main-server.js + main/          the main app (Generate / Render / Library) on :3000
├── server.js + public/             the tuning bench (sample→render→judge) on :4000
├── worlds/                         saved generated Worlds (gitignored)
└── outputs/                        rendered artifacts (gitignored); scorecard.md is tracked
```

## Docs

- [`sampling/WORLD-CONTRACT.md`](sampling/WORLD-CONTRACT.md) — the World object + renderer contract (architecture).
- [`sampling/BACKSTORY.md`](sampling/BACKSTORY.md) — events-as-backstory + the render-form redesign, with worked examples.
- [`sampling/CLAUDE.md`](sampling/CLAUDE.md) — operating manual, decision log, open questions.
