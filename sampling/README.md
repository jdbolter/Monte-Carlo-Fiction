# Alternate-present generator — `sampling/`

Everything under this directory supports one flow:

```
history corpus + scenario brief → alternate-present World JSON → selected render
```

## Modules

| File | Responsibility |
|---|---|
| `history/*.json` | Stable researched event corpora supplied to the generator |
| `history.js` | Corpus discovery, loading, event IDs, and hashes |
| `world-schema.js` | Structured-output JSON schema and causal validation |
| `world-generator.js` | Cached Anthropic prompt and sequential batch generation |
| `world.js` | World envelope, IDs, persistence, listing, and clearing |
| `render-world.js` | World-to-artifact render forms and artifact persistence |
| `anthropic.js` | Shared API retry/backoff and usage normalization |
| `main-server.js` | Local HTTP API and static server |
| `main/index.html` | Generate / Render / Library interface |
| `worlds/` | Gitignored generated Worlds |
| `outputs/library/` | Gitignored rendered artifacts |

## Prompt caching

The generation request contains two user content blocks. The first holds the complete history
corpus and ends with an explicit five-minute cache breakpoint. The second holds the variable
scenario brief, batch index, prior variant summaries, and any correction instructions. Batch
generation is sequential because a cache entry becomes reusable only after the first response
begins.

Each World stores Anthropic's cache creation/read counters in `provenance.usage`, and the interface
shows whether a request created or hit the cache.

## Validation

Anthropic's JSON structured-output feature guarantees field shape and types. Application validation
then checks semantics the schema cannot enforce:

- divergence occurs no later than the endpoint;
- IDs are unique;
- the timeline is chronological;
- causal references point backward;
- historical references exist in the selected corpus;
- endpoint sections satisfy the compact item counts required by the World contract.

One automatic correction request is allowed if semantic validation fails. If it fails again, that
variant is reported as an error while other variants in the requested batch continue.

## Rendering

`render-world.js` sends only the completed World content, not the full history corpus. Current forms:

- `narrative-history` — approximately 1,000 words;
- `fiction` — approximately 1,000 words;
- `found-document`, `scene`, and `testimony` — shorter diagnostic or design-fiction forms.

The World contains no characters, scenes, plots, or miniature story examples. Fiction renderers
invent them from endpoint facts and tensions. The interface provides an optional render brief for
focus, viewpoint, setting, tone, or emphasis; a blank brief leaves those choices to the renderer.

The render prompt explicitly prevents divergence-era technology from remaining culturally frozen
and requires the endpoint's continuities and conflicts to remain visible.
