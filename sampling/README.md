# World generators — `sampling/`

Everything under this directory supports one flow:

```
historical lineage + structured brief → alternate-history.v1 or future.v1 → selected render
```

See [`HISTORY-CORPUS-CONTRACT.md`](HISTORY-CORPUS-CONTRACT.md) before adding a timeline. A valid
file is auto-discovered and needs no registry or interface change.

## Modules

| File | Responsibility |
|---|---|
| `history/*.json` | Stable researched event corpora, with optional experiment eligibility |
| `history.js` | Corpus discovery, loading, event IDs, and hashes |
| `HISTORY-CORPUS-CONTRACT.md` | Authoritative corpus format, template, and research guidance |
| `validate-corpora.js` | Offline validation for all discovered corpus files |
| `alternative-planner.js` | Compact distinct-route planning for multi-World Alternate History requests |
| `world-schema.js` | Structured-output JSON schema and causal validation |
| `world-generator.js` | Direct single-World or planned route-assigned batch generation |
| `future-schema.js` | `future.v1` structured-output schema, modes, and semantic audit |
| `future-generator.js` | Four-mode cached future generation |
| `world.js` | World envelope, IDs, persistence, listing, and clearing |
| `render-world.js` | World-to-artifact render forms and artifact persistence |
| `artifact-pdf.js` | Dependency-free, on-demand PDF layout for saved rendered artifacts |
| `anthropic.js` | Shared API retry/backoff and usage normalization |
| `main-server.js` | Local HTTP API and static server |
| `main/index.html` | Generate / Render / Library interface |
| `worlds/` | Gitignored generated Worlds |
| `outputs/library/` | Gitignored rendered artifacts |

## Prompt caching

Each generation request contains two user content blocks. The first holds the complete history
corpus and ends with an explicit five-minute cache breakpoint. The second holds variable task
input.

For more than one Alternate History World, the first call returns a compact set of distinct causal
routes. The planner and World generator use the same system prompt and exact history block, so
route-specific World calls can reuse the cache created when planning begins. Each World call
receives one assigned route rather than summaries of Worlds already generated. Single-World
requests skip planning. Future batches retain their existing sequential behavior.

Each World stores Anthropic's cache creation/read counters in `provenance.usage`, and the interface
shows whether a request created or hit the cache.

## Validation

Anthropic's JSON structured-output feature guarantees field shape and types. Application validation
then audits semantics the schema cannot enforce:

- alternate-history start/divergence and ending years match the supplied boundaries;
- IDs are unique;
- the timeline is chronological;
- causal references point backward;
- historical references exist in the selected corpus;
- endpoint sections satisfy the compact item counts required by the World contract.

Semantic warnings do not trigger another model call or prevent saving. They are attached to the
World and written with the full response under `outputs/diagnostics/` for later analysis. These
diagnostics persist when the interface's Clear Everything action removes Worlds and artifacts.
Only unusable API results—such as truncation, refusal, or missing JSON—fail generation.

## Rendering

`render-world.js` sends the completed World plus compact excerpts of only the historical events
cited by its `historicalForces`, timeline, and divergence anchor—not the full history corpus.
Current forms:

- `narrative-history` — approximately 1,000 words;
- `fiction` — approximately 1,000 words;
- `found-document`, `scene`, and `testimony` — shorter diagnostic or design-fiction forms.

The World contains no characters, scenes, plots, or miniature story examples. Fiction renderers
invent them from endpoint facts and tensions. The interface provides an optional render brief for
focus, viewpoint, setting, tone, or emphasis; a blank brief leaves those choices to the renderer.

The renderer receives a normalized endpoint for either contract. Narrative history makes inherited
forces explicit as path dependence and transformation. Fiction makes them perceptible indirectly
through mature descendants, institutions, practices, infrastructure, and conflict. Alternate
trajectories remain counterfactual history; future trajectories remain coherent possibilities
rather than predictions.
