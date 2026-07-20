# Monte-Carlo-Fiction — agent operating manual

## Current architecture

The project generates **model-authored structured alternate presents** from real historical
corpora and user-authored scenario briefs. It no longer samples abstract dimensions or selects a
backstory algorithmically.

The pipeline has three deliberate stages:

1. **Evidence** — `sampling/history/*.json`, stable historical event corpora.
2. **World generation** — one Anthropic structured-output call per World. The history prefix is
   explicitly cached; the variable scenario brief follows it. Worlds are generated sequentially
   within a batch so the cache can be reused.
3. **Rendering** — a separate model call turns a selected saved World into a narrative history,
   fiction, scene, testimony, or found document. Renderers never regenerate the World.

World generation is no longer free or deterministic. Preserve the separation between compact
structured generation and selective prose rendering.

## Important files

- `sampling/history.js` — discovers and loads history corpora; computes corpus hashes.
- `sampling/history/vr.json` — 68-event immersive/visual-media history.
- `sampling/history/silicon-valley.json` — 56-event computing/capital history.
- `sampling/world-schema.js` — Anthropic JSON schema plus application-level causal validation.
- `sampling/world-generator.js` — cached prompt, structured-output request, correction retry, and
  sequential batch generation.
- `sampling/world.js` — saved World envelope and filesystem persistence.
- `sampling/render-world.js` — render forms, prompt, artifact persistence, and verdicts.
- `sampling/anthropic.js` — shared Messages API retry/backoff and usage normalization.
- `sampling/main-server.js`, `sampling/main/index.html` — zero-dependency web application.
- `test/alternate-present.test.js` — offline schema, cache-boundary, validation, and render tests.

## Run and verify

```bash
npm run dev
npm test
```

The app starts on port 3000 and tries the next 20 ports if necessary. `.env.local` must contain
`ANTHROPIC_API_KEY` for generation or rendering. Do not print or commit the key.

## World rules

- The scenario divergence is a fiat; the generator infers necessary enablers rather than rejecting
  it.
- Real historical events are evidence and raw material, not a mandatory chronological path.
- `sourceRefs` must exist in the selected corpus.
- `causedBy` may reference assumptions or earlier timeline events only.
- The endpoint must show mature descendants, not old divergence-era devices frozen in time.
- Worlds retain a mixed media ecology and explicitly record continuities, costs, exclusions, and
  unresolved tensions.
- World fields use compact factual phrases rather than publication-ready prose. They contain no
  characters, scenes, plots, or miniature story examples; those belong to rendering.
- An optional render brief may guide focus, viewpoint, setting, tone, or emphasis, but may not
  contradict the saved World.
- Application metadata—not the model—supplies IDs, model name, corpus hash, prompt version,
  original brief, generation time, and usage.

## Generated data

`sampling/worlds/*.json` and `sampling/outputs/*/*.json` are gitignored model outputs. The web
interface's Clear Everything action removes both together. Old pre-redesign ignored files may exist
locally, but loaders ignore records whose schemas are not `alternate-present.v1` or `artifact.v1`.

## Open work

- Evaluate generated Worlds for causal quality and diversity across repeated briefs.
- Tune schema field counts and generator instructions from real output.
- Compare Sonnet, Haiku, and OpenAI models after an OpenAI provider is implemented.
- Design future-world inputs: pivot-forward, endpoint-backcast, bounded corridor, and an optional
  researched current-drivers corpus.
