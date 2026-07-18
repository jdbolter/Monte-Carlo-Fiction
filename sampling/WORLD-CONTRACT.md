# The world contract — one world model, many renderings

*Working design, 2026-07-17. Supersedes the earlier "two interchangeable generators" framing.
The go-forward architecture for the redesign.*

## The core commitment

There is **one world model**, and it has **two ingredients**:

1. **Changed dimensions** — what is different about this present (a configuration over the
   dimension table, with some values off their ground value).
2. **Event backstory** — the real historical events that ground those changes (selected from
   the history corpora because they resonate with the changed dimensions).

A world is the marriage of the two: `world = changed dimensions + event backstory`. Neither
half is ever produced or shipped on its own again. Dimension-sampling without history (the
abstract essay) and the causal forward-walk without divergence (which drifted back to
reality) are both retired **as standalone outputs**. Difference is guaranteed by the
dimensions; grounding is supplied by the events.

## Terminology

Two sides, named plainly (dropping "front/back end," which was backwards):

- **World-building side** — where a world is made (dimensions chosen + backstory attached).
- **Rendering side** — where a finished world is turned into an artifact (story, scene,
  essay, video script, found document…).

You start at the world-building side, which is why it feels like the front.

## The World object

The single structure everything passes through. A renderer only ever sees this.

```
World {
  id            // stable id (e.g. from the config's changed moves)
  domain        // which dimension table + corpora, e.g. "media-present"
  seed?         // when the dimensions were sampled deterministically
  createdAt

  dimensions {
    all:      { <dimId>: <value>, ... }        // the full configuration
    changed:  [ { dimension, label, value, ground, exclusive, gloss } ]  // off-ground moves
    k:        <number>                          // how many are changed
  }

  facts:    [ <string>, ... ]   // the changed moves as plain world-facts the render MUST
                                 //   honor — the render-ready translation of dimensions.changed

  backstory {
    events: [ { display, year, label, description, corpus, matched } ]
    brief:  <string>            // the assembled backstory text
  }

  summary:  <string>            // one-line human gist
  provenance { direction: "sampled" | "pastcast" | "backcast", ... }
}
```

`dimensions` is ingredient one; `backstory` is ingredient two; `facts` is the render-ready
form of ingredient one (see below). That's the whole object.

## Where the two ingredients come from

The old "modes" are not separate engines — they are **ways of filling in this one object**:

- **The changed dimensions** come from either the RNG sampling the dimension table
  (`sampler.js`) or a deliberately chosen target present.
- **The backstory** comes from selecting events by resonance with the changed dimensions
  (`backstory.js`).
- **pastcast vs. backcast** is only *which end you reason from* — start from history and see
  what present it grounds, or start from a target present and pull the history that fits. It
  is a `provenance.direction` label on the same object, not a different pipeline.

## The rendering side

Every output form is a module with one signature:

```
render(world, options) -> { form, output, meta }
```

- A renderer reads `facts`, `backstory`, and `summary` by default — never the raw dimension
  ids, never mode-specific internals. That is what makes any world renderable by any form.
- It may reach into `dimensions` / provenance for richer output, but must degrade gracefully.
- Renderers self-register in a small registry so an interface can ask "what forms can I make
  from this world?" and expose whatever subset it wants. All forms persist underneath, exposed
  or not.

First entries in the renderer library (see `BACKSTORY.md`): **scene**, **found document**,
**testimony**. Later: essay, video/animation script, prose story. "Pick a form" means pick
which to build first, never which to keep.

## Kept vs. retired

**Kept:** the dimension table (`media-present/dimensions.json`); the sampler; the backstory
selector; the two research-expanded event corpora (`history/*.json`) as the backstory source;
the renderer library.

**Retired as world-generators:** the causal engine's forward-walking mechanism (selector,
causal-state, counterfactual-outcome walk) — its convergence is the thing we drop. Its *data*
(the real events) lives on as backstory. The jargon-essay render form is retired as an end
product.

## Facts: translating dimensions into world-facts

The one adapter the render side depends on: each changed move becomes a plain sentence, with
no dimension vocabulary. This `value → world-fact` table is the concrete next artifact (the
`gloss` fields in `dimensions.json` are a starting point). Examples:

- `custody = in-body-mortal` → "People carry their media inside their bodies; it dies with
  them and cannot be copied out."
- `provisioning = welfare-entitlement` → "Access to media is a publicly guaranteed right, not
  something bought."
- `authorship = universal` → "Everyone makes media; there is no separate class of professional
  makers."
- `attention_unit = congregation` → "Media is attended to in gathered groups, not alone."

Emphasis moves get "predominantly / mostly"; exclusive moves are stated flatly.

## Build sequence (additive — nothing existing gets rewritten yet)

1. `makeWorld({ config, dims, backstory, provenance })` → assembles the World object,
   including the `facts` translation. (Small new module, e.g. `world.js`.)
2. The `value → world-fact` table (finish it).
3. Adapt the render step into a renderer with the `render(world, options)` signature, behind a
   chosen form; register it.
4. Leave the causal engine and its two renderers untouched until there's a reason to migrate
   them to consume a World.

## Open items

- Finish the `value → world-fact` table for all dimensions/values.
- Decide the first form(s) to build (recommendation: found document + scene).
- The backstory bridge (`DIMENSION_TAG_MAP`, event tags) is first-pass; revise.
- Whether a world should ever draw backstory from only one lineage vs. both.
