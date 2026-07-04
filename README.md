# Monte-Carlo-Fiction

This is a testbed for the idea of generating a run of x (>99) narratives consisting of variation on a theme. The narratives might be speculative (design) fictions or more traditional narratives with character development and interaction. The resulting narrative would then be read and analyzed by an LLM.

See `MONTE_CARLO_STRATEGY.md` for the full design rationale.

## Architecture

Two layers, kept deliberately separate so new themes never require touching engine code:

- **`engine/`** — shared, theme-agnostic. `selector.js` walks a theme's milestone pool with trajectory-vector scoring (stochastic, seed-reproducible); `worldgen.js` drives N runs into structured "world" JSON — free, fast, no model calls; `render.js` makes exactly one model call per world to turn its chosen path into a short story; `validate.js` reports diversity/repeated-ending metrics across a batch.
- **`themes/<id>/`** — one folder per theme: `theme.config.json` (trajectory axes, model choice, run defaults), `milestones.json` (the inflection-point pool), `framework.json` (optional short framing primer). See `themes/_template/README.md` for the schema and how to add a new theme.
- **`api/`** — thin HTTP handlers wiring the engine to the web UI (`list-themes`, `generate-worlds`, `render-story`, `list-worlds`, `list-stories`).
- **`public/`** — the web interface: pick a theme, generate a batch of worlds, render any of them to prose, browse the library.
- **`data/worlds/<theme>/`** and **`outputs/stories/<theme>/`** — generated artifacts, one JSON file per world/story.

`vr-immersion` is the first theme, ported from the VR_Speculation repo's pastcasting milestone pool, mainly as a working test case for the engine.

## Running it

```
npm run dev          # starts a local server at http://localhost:3000 (auto-increments the port if taken), no dependencies to install
```

World generation works immediately with no setup. To render stories, copy `.env.local.example` to `.env.local` and add an `ANTHROPIC_API_KEY`.

There are also CLI equivalents for batch work, in `scripts/`:

```
npm run generate -- --theme vr-immersion --count 100        # free, no API key needed
npm run render -- --theme vr-immersion --limit 20            # renders un-rendered worlds, costs real API calls
```

## Adding a theme

Copy `themes/_template/` to `themes/<your-theme-id>/` and follow the README inside it. No registration step — the engine discovers every folder under `themes/` automatically.

