# Monte-Carlo-Fiction

This is a testbed for the idea of generating a run of x (>99) narratives consisting of variation on a theme. The narratives might be speculative (design) fictions or more traditional narratives with character development and interaction. The resulting narrative would then be read and analyzed by an LLM.

The two active themes are schema-v2 **causal alternate-history** experiments. They support canonical baseline, single-divergence, limited-divergence, naturalistic, and all-counterfactual batches so alternatives can be compared with controls.

See `MONTE_CARLO_STRATEGY.md` for the full design rationale.

`vr-immersion` contains 47 events and 38 typed facts spanning Barker's panorama through the 2026 Horizon Worlds reversal. `silicon-valley` contains 37 events—including all 28 converted source milestones and nine explicit downstream consequences—governed by 24 typed facts. The schema and design rationale live under [`docs/causal-v2/`](docs/causal-v2/README.md). The former schema-v1 theme folders were removed after their causal replacements became the standard versions; their source data remains available in Git history.

## Architecture

Two layers, kept deliberately separate so new themes never require touching engine code:

- **`engine/`** — shared, theme-agnostic. `worldgen.js` dispatches missing/`schemaVersion: 1` themes to the unchanged `selector.js` path and `schemaVersion: 2` themes to `causal-worldgen.js`. The causal path uses typed state, outcome-specific effects, time-window eligibility, explicit divergence policies, and replay validation. Both paths produce structured world JSON for the prose and scene-script renderers; no model calls occur during world generation.
- **`themes/<id>/`** — one folder per theme. Schema-v1 themes use `milestones.json`; schema-v2 themes use `events.json` plus `state-registry.json`. Both use `theme.config.json` and may supply `framework.json`.
- **`api/`** — thin HTTP handlers wiring the engine to the web UI (`list-themes`, `generate-worlds`, `render-story`, `render-scene`, `list-worlds`, `list-stories`, `list-scenes`).
- **`public/`** — the web interface: pick a theme, generate a batch of worlds, render any of them as prose or as a scene script (or both — they're independent per world), browse the library, or clear a theme's worlds and renders together.
- **`data/worlds/<theme>/`**, **`outputs/stories/<theme>/`**, and **`outputs/scenes/<theme>/`** — generated artifacts, one JSON file per world/story/scene-script.

`vr-immersion` was originally ported from the VR_Speculation repo's pastcasting milestone pool; it is now the first full causal reference theme.

## Running it

```
npm run dev          # starts a local server at http://localhost:3000 (auto-increments the port if taken), no dependencies to install
npm test             # causal-runtime and legacy-compatibility tests
```

World generation works immediately with no setup. To render stories or scene scripts, copy `.env.local.example` to `.env.local` and add an `ANTHROPIC_API_KEY`.

There are also CLI equivalents for batch work, in `scripts/`:

```
npm run generate -- --theme vr-immersion --count 100          # free, no API key needed
npm run generate -- --theme silicon-valley --count 100        # free, no API key needed
npm run render -- --theme vr-immersion --limit 20             # renders un-rendered worlds to prose, costs real API calls
npm run render-scenes -- --theme vr-immersion --limit 20      # renders un-rendered worlds to scene scripts, costs real API calls
```

## Adding a theme

For schema v2, use `themes/vr-immersion/` or `themes/silicon-valley/` with `docs/causal-v2/` as working examples and specification. The engine still accepts schema-v1 data for compatibility, but no active theme uses it. No registration step—the engine discovers every folder under `themes/` automatically.

## Future applications

The same approach could support many subjects besides technological history:

- **Alternative biographies** — follow a well-known figure through different mentors, education, employment, relationships, geographic moves, successes, and failures. State would describe changing resources, affiliations, reputation, commitments, and opportunities rather than treating personality as fixed destiny.
- **Political turning points** — explore elections, reforms, revolutions, diplomatic crises, social movements, or wars through choices that change coalitions, legitimacy, institutional capacity, public opinion, and later event eligibility.
- **Histories of science** — model a discovery as the product of competing theories, instruments, laboratories, funding systems, communication networks, and priority disputes. This could show alternatives in which a result arrives elsewhere, later, under another interpretation, or not at all, without reducing scientific change to a single “great person.”
- **Institutions and places** — generate alternate histories of a university, laboratory, company, city, region, museum, or government agency as leadership decisions, funding, migration, regulation, and external shocks alter its development.
- **Cultural and intellectual movements** — examine how artistic schools, literary genres, philosophical traditions, or media forms change through patronage, censorship, translation, new production tools, critical reception, and encounters among particular people and institutions.
- **Other technological systems** — apply the existing model to fields such as computing, biotechnology, energy, transportation, spaceflight, or communications, especially where standards, regulation, capital, and institutional ownership create several plausible paths.

A subject is especially suitable when it has documented inflection points, multiple defensible outcomes, a manageable set of state variables, and consequences that can be expressed as later requirements, enables, disables, or softer influences. Each new theme should distinguish documented history from historical inference and speculation, preserve sources for its causal claims, and begin with preliminary values that can be revised after batch testing and expert review.
