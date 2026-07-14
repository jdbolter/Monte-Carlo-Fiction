# Monte-Carlo-Fiction

This is a testbed for the idea of generating a run of x (>99) narratives consisting of variation on a theme. The narratives might be speculative (design) fictions or more traditional narratives with character development and interaction. The resulting narrative would then be read and analyzed by an LLM.

The two current themes are explicitly **alternate-histories** experiments: every generated legacy world diverges from the real historical record at every branch point it passes through. The schema-v2 causal engine also supports canonical baseline, single-divergence, limited-divergence, naturalistic, and all-counterfactual batches so alternatives can be compared with controls.

See `MONTE_CARLO_STRATEGY.md` for the full design rationale.

An experimental schema-v2 causal runtime and eight-event VR fixture live under [`docs/causal-v2/`](docs/causal-v2/README.md). The runtime is tested, but the fixture is deliberately not an active theme yet; `vr-immersion` and `silicon-valley` still use the legacy milestone format unchanged.

## Architecture

Two layers, kept deliberately separate so new themes never require touching engine code:

- **`engine/`** — shared, theme-agnostic. `worldgen.js` dispatches missing/`schemaVersion: 1` themes to the unchanged `selector.js` path and `schemaVersion: 2` themes to `causal-worldgen.js`. The causal path uses typed state, outcome-specific effects, time-window eligibility, explicit divergence policies, and replay validation. Both paths produce structured world JSON for the prose and scene-script renderers; no model calls occur during world generation.
- **`themes/<id>/`** — one folder per theme: `theme.config.json` (trajectory axes, model choice, run defaults), `milestones.json` (the inflection-point pool), `framework.json` (optional short framing primer). See `themes/_template/README.md` for the schema and how to add a new theme.
- **`api/`** — thin HTTP handlers wiring the engine to the web UI (`list-themes`, `generate-worlds`, `render-story`, `render-scene`, `list-worlds`, `list-stories`, `list-scenes`).
- **`public/`** — the web interface: pick a theme, generate a batch of worlds, render any of them as prose or as a scene script (or both — they're independent per world), browse the library, or clear a theme's worlds and renders together.
- **`data/worlds/<theme>/`**, **`outputs/stories/<theme>/`**, and **`outputs/scenes/<theme>/`** — generated artifacts, one JSON file per world/story/scene-script.

`vr-immersion` is the first theme, ported from the VR_Speculation repo's pastcasting milestone pool, mainly as a working test case for the engine.

## Running it

```
npm run dev          # starts a local server at http://localhost:3000 (auto-increments the port if taken), no dependencies to install
npm test             # causal-runtime and legacy-compatibility tests
```

World generation works immediately with no setup. To render stories or scene scripts, copy `.env.local.example` to `.env.local` and add an `ANTHROPIC_API_KEY`.

There are also CLI equivalents for batch work, in `scripts/`:

```
npm run generate -- --theme vr-immersion --count 100         # free, no API key needed
npm run render -- --theme vr-immersion --limit 20             # renders un-rendered worlds to prose, costs real API calls
npm run render-scenes -- --theme vr-immersion --limit 20      # renders un-rendered worlds to scene scripts, costs real API calls
```

## Adding a theme

For the current legacy format, copy `themes/_template/` to `themes/<your-theme-id>/` and follow the README inside it. No registration step — the engine discovers every folder under `themes/` automatically. The v2 format is documented separately in `docs/causal-v2/`; its pilot should remain outside `themes/` until its event pool is ready to become active.
