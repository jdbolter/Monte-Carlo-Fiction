# Monte-Carlo-Fiction — agent operating manual

## Current architecture

The project generates **model-authored structured alternate histories and future scenarios** from
real historical lineages and user-authored briefs. It no longer samples abstract dimensions or
selects a backstory algorithmically.

The pipeline has three deliberate stages:

1. **Evidence** — `sampling/history/*.json`, stable historical event corpora.
2. **World generation** — Alternate History uses one direct Anthropic structured-output call for a
   single World. A multi-World request first makes one compact alternative-route planning call,
   then one World call per assigned route. Alternate histories use `alternate-history.v1`; four
   future modes use `future.v1`. The lineage prefix is explicitly cached and batch generation is
   sequential so it can be reused.
3. **Rendering** — a separate model call turns a selected saved World into a narrative history,
   fiction, scene, testimony, or found document. Renderers never regenerate the World.

World generation is no longer free or deterministic. Preserve the separation between compact
structured generation and selective prose rendering.

## Important files

- `sampling/history.js` — discovers and loads history corpora; computes corpus hashes.
- `sampling/HISTORY-CORPUS-CONTRACT.md` — authoritative input format, copyable template, research
  guidance, and installation procedure for new historical timelines.
- `sampling/validate-corpora.js` — validates every discovered corpus without making an API call.
- `sampling/history/vr.json` — 68-event immersive/visual-media history.
- `sampling/history/silicon-valley.json` — 56-event computing/capital history.
- `sampling/history/digital-media.json` — 70-event history of the computer as a digital medium,
  from programmable machines through generative and agentic creative systems.
- `sampling/history/world-war-ii.json` — 67-event global chronology from the Nazi seizure of power
  in 1933 through the war and its immediate aftermath in 1950; Alternate History only.
- `sampling/world-schema.js` — Anthropic JSON schema plus application-level causal validation.
- `sampling/alternative-planner.js` — compact causal-route schema, request, and structural
  validation for multi-World Alternate History batches.
- `sampling/world-generator.js` — cached prompt, structured-output request, semantic audit, and
  direct or route-assigned sequential generation.
- `sampling/future-schema.js`, `sampling/future-generator.js` — future contract, four modes, audit,
  and cached sequential generation.
- `sampling/world.js` — saved World envelope and filesystem persistence.
- `sampling/render-world.js` — render forms, prompt, artifact persistence, and verdicts.
- `sampling/artifact-pdf.js` — on-demand paginated PDF generation for Library artifacts.
- `sampling/anthropic.js` — shared Messages API retry/backoff and usage normalization.
- `sampling/main-server.js`, `sampling/main/index.html` — zero-dependency web application.
- `test/alternate-present.test.js` — offline schema, cache-boundary, validation, and render tests.

## Run and verify

```bash
npm run dev
npm test
npm run validate:corpora
```

The app starts on port 3000 and tries the next 20 ports if necessary. `.env.local` must contain
`ANTHROPIC_API_KEY` for generation or rendering. Do not print or commit the key.

## World rules

- The scenario divergence is a fiat; the generator infers necessary enablers rather than rejecting
  it.
- Alternate History copies the user-supplied starting/divergence year and ending year exactly; the
  endpoint is not assumed to be the actual present.
- Real historical events are evidence and raw material, not a mandatory chronological path.
- A corpus may declare an `experiments` allowlist. Omission preserves the default availability in
  both Alternate History and Future Speculation.
- `sourceRefs` must exist in the selected corpus.
- New Worlds contain exactly four `historicalForces`, each citing corpus events and distinguishing
  an inherited legacy from its causal effect on the World.
- `causedBy` may reference assumptions or earlier timeline events only.
- Semantic violations are saved as World validation warnings and persistent diagnostic responses;
  they do not trigger an automatic corrective model call or prevent saving.
- The endpoint must show mature descendants, not old divergence-era devices frozen in time.
- Worlds retain a mixed media ecology and explicitly record continuities, costs, exclusions, and
  unresolved tensions.
- World fields use compact factual phrases rather than publication-ready prose. They contain no
  characters, scenes, plots, or miniature story examples; those belong to rendering.
- An optional render brief may guide focus, viewpoint, setting, tone, or emphasis, but may not
  contradict the saved World.
- Rendering resolves only the World's cited historical events. Narrative history uses them to
  explain path dependence; fiction expresses their effects indirectly rather than recounting them.
- Application metadata—not the model—supplies IDs, model name, corpus hash, prompt version,
  original brief, generation time, and usage.
- One requested Alternate History World skips route planning. Two or more trigger exactly one
  alternative-plan call, followed by one World call per route.
- Planned routes must differ in causal thesis, mechanisms, transformed corpus events, and expected
  endpoint settlement. Do not reintroduce prior-World summary prompting.
- Save each assigned route under `provenance.alternativeRoute`. There is deliberately no automated
  diversity audit, similarity rejection, or corrective regeneration.
- Future modes control which boundaries are supplied: pivot-forward, endpoint-backcast,
  bounded-corridor, or open-exploration. All output timelines remain chronological and forward.

## History corpus rules

Treat [`sampling/HISTORY-CORPUS-CONTRACT.md`](sampling/HISTORY-CORPUS-CONTRACT.md) as
authoritative. In particular:

- A corpus is input evidence, not a generated World, branch tree, list of outcomes, or render.
- Its filename is its stable ID and must match `[a-z0-9-]+.json`.
- Required top-level fields are non-empty `corpus`, `purpose`, and `events`.
- `displayName`, `sourceNote`, `sources`, and `tagLegend` are optional but recommended as
  appropriate.
- `experiments`, when supplied, is a non-empty allowlist containing `alternate-history`, `future`,
  or both. Omission enables both.
- Every event requires a unique lowercase kebab-case `id`, integer `year`, non-empty `display`,
  `label`, and `description`, plus a string array `tags`.
- Event IDs are durable because Worlds cite them in `sourceRefs`. Never rename or recycle an ID
  without accepting that saved Worlds may no longer resolve their historical evidence.
- Put events in nondecreasing chronological order; multiple events may share a year.
- Use factual received history. Do not embed counterfactual branches, future predictions,
  characters, scenes, or endpoint conditions in event descriptions.
- Favor causal coverage—institutions, capabilities, economics, laws, reception, resistance,
  failures, harms, and context—over exhaustive chronology. Roughly 40–80 events is a useful range,
  not a validation rule.
- The full corpus source is sent verbatim as the cached prompt prefix. Keep it informative but
  compact because its size affects input and cache-creation tokens.
- Adding a valid file requires no registry or UI edit. Unknown corpora receive generic blank
  interface drafts; curated defaults may still be added to `DEFAULT_HISTORY_DRAFTS` or
  `DEFAULT_FUTURE_DRAFTS`.
- Always run `npm run validate:corpora` and `npm test` after adding or changing a corpus.

The corpus contract is domain-neutral. The current World endpoint schema and portions of its prompt
are still media-oriented (`technicalSystem`, `entertainment`, `socialMedia`,
`institutionsAndEconomy`, `accessAndConflict`). Do not silently claim full domain neutrality.
Political, military, scientific, or biographical corpora may reveal the need for endpoint profiles
or a more general World contract.

## Generated data

`sampling/worlds/*.json` and `sampling/outputs/*/*.json` are gitignored model outputs. Library PDF
downloads are generated on demand and are not stored by the application. Clear Everything removes
Worlds and artifacts but preserves diagnostic responses. Loaders accept
`alternate-history.v1`, legacy `alternate-present.v1`, `future.v1`, and `artifact.v1`.

## Open work

- Evaluate whether planned routes produce meaningfully distinct Worlds across repeated briefs.
- Tune schema field counts and generator instructions from real output.
- Compare Sonnet, Haiku, and OpenAI models after an OpenAI provider is implemented.
- Evaluate all four future modes and decide whether to add a researched current-drivers corpus.
- Evaluate WWII output to determine how the media-oriented endpoint should be generalized for
  political and military histories.
