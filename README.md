# Monte-Carlo-Fiction

An experiment in generating sets of structured alternate histories from researched historical
corpora, then selectively rendering the most interesting worlds.

The current implementation generates **alternate presents**. A user chooses a history corpus,
writes a prose scenario brief describing a divergence and optional endpoint, and asks for one or
more variants. Claude returns each variant as an enforced `alternate-present.v1` JSON object.

```
historical corpus (cached) + scenario brief
    → model-generated World JSON
    → inspect and select
    → narrative history, fiction, scene, testimony, or found document
```

World generation now uses a model call because the central task is causal speculation: deciding
which real events survive, which change, what enabling conditions are required, and how the
technology and its culture mature across decades. The historical corpora remain the stable shared
evidence. Compact structured worlds are generated first; longer prose is purchased only for worlds
worth rendering.

## Run

Requires Node 18 or newer. No package installation is necessary.

1. Copy `.env.local.example` to `.env.local` and add `ANTHROPIC_API_KEY`.
2. Start the application:

```bash
npm run dev
```

Open the printed local URL, normally <http://localhost:3000>.

Run the offline tests with:

```bash
npm test
```

## Interface

- **Generate** — choose `vr` or `silicon-valley`, enter a divergence/endpoint brief, and
  generate up to 20 structured variants. Requests run sequentially so later calls can reuse the
  cached history prefix.
- **Render** — inspect complete World JSON and render selected worlds. The primary forms are
  `narrative-history` and `fiction`; shorter diagnostic forms are also retained. An optional render
  brief can specify focus, viewpoint, setting, tone, or emphasis without changing the World.
- **Library** — read renders and record `cohere`, `strain`, or `incoherent` judgments.
- **Clear everything** — deletes generated worlds and rendered artifacts together.

Generated worlds and artifacts are gitignored. Each saved World records the exact scenario brief,
history-corpus hash, model, prompt version, batch position, and API/cache token usage.

## World contents

Each World contains:

- the divergence and optional requested endpoint;
- enabling assumptions with qualitative plausibility;
- an exactly nine-event causal timeline;
- a mature endpoint state covering technology, entertainment, social media, institutions,
  economics, access, and conflict;
- continuities with actual history;
- unresolved tensions that renderers can translate into histories, characters, and situations.

World fields deliberately use compact factual phrases rather than publication-ready prose. Fictional
characters, scenes, and plots are invented only during rendering.

Timeline events distinguish `retained`, `altered`, and `invented` developments. `sourceRefs` must
match exact IDs in the selected historical corpus, and `causedBy` must point to assumptions or
earlier timeline events. The application audits these rules after generation. A World with semantic
problems is still saved, visibly marked with warnings, and accompanied by a diagnostic file for
later prompt and validator improvement. There is no automatic semantic-regeneration call.

See [`sampling/WORLD-CONTRACT.md`](sampling/WORLD-CONTRACT.md) for the complete contract and
[`sampling/README.md`](sampling/README.md) for the module map.

## Future worlds

Future speculation is deliberately not implemented yet. The likely extension will retain the same
trajectory + endpoint World shape while supporting different premise directions: pivot-forward,
endpoint-backcast, or a bounded corridor between a near-term pivot and a broad future condition.
It may add a researched current-drivers corpus alongside historical lineage.
