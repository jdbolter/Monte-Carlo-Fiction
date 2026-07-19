# The world model — `sampling/`

The whole system. A **World** = **changed dimensions + event backstory**, rendered into an
**artifact**. (Overview and quick start are in the repo-root [`README.md`](../README.md); this
note covers the internals.)

- **ground** = our world's value for a dimension; **k** = number of dimensions off ground
  (Hamming distance). k=0 is our present (a forecast); k=1–2 is where coherent, strange worlds
  live — coherence depends on whether the changed dimensions form a *thematic bundle*, not on k.
- A dimension is **exclusive** (its value strictly holds) or **emphasis** (predominant, not
  absolute). Only `resemblance` is ordered.

## Files

```
media-present/dimensions.json   9 dimensions; each value has a gloss (designer) + worldFact (render)
history/vr.json                 immersive-media backstory corpus (~68 events, 1600s–2026)
history/silicon-valley.json     computing/capital backstory corpus (~56 events, 1909–2024)
sampler.js                      free, seeded, k-targeted sampling + enumeration
backstory.js                    selects grounding events per changed move (DIMENSION_TAG_MAP)
world.js                        makeWorld() — the unified World object; generateWorlds() + CLI
render-config.js                renderer: World → artifact (FORMS, SYSTEM levers, retry, scorecard)
main-server.js + main/          main app (Generate / Render / Library) on :3000
server.js + public/             tuning bench (sample → render → judge) on :4000
worlds/, outputs/               generated Worlds / rendered artifacts (gitignored; scorecard.md tracked)
```

## Run

```
npm run world -- --k-range 1 2 --n 3 --seed 4        # generate + inspect Worlds (free)
npm run backstory -- --k 2 --seed 7                  # backstory selection + reasons (free)
npm run render -- --k 2 --n 5 --seed 1 --form found-document      # render (needs API key)
npm run render -- ... --dry-run                      # preview the prompt, free
npm run main        # main app :3000        npm run ui   # tuning bench :4000
```

## The World object (see `WORLD-CONTRACT.md`)

```
{ id, domain, seed, provenance,
  dimensions:{ all, changed:[{dimension,label,value,ground,exclusive,gloss,worldFact}], k },
  facts:[ <plain sentence per changed move> ],
  backstory:{ events:[...], brief },
  summary }
```

Renderers consume `facts` + `backstory` (never the raw dimension ids) and produce an artifact
in a form. Current forms: `found-document` (default), `scene`, `testimony`.

## Status & open questions

The pipeline runs end to end: sample → ground in backstory → render an artifact → judge. The
live tuning work is the **render voice** — three levers (tone, lineage, grain) in the `SYSTEM`
string of `render-config.js`, first-pass. The backstory `DIMENSION_TAG_MAP` and event tags are
also provisional. Full decision log and open questions in the root [`CLAUDE.md`](../CLAUDE.md); the
render-form rationale and worked examples in [`BACKSTORY.md`](BACKSTORY.md).
