# Monte-Carlo-Fiction

An experiment in generating structured alternate histories and future scenarios from researched
historical lineages, then selectively rendering the most interesting Worlds.

The opening screen separates two experiments that share a core pipeline:

- **Alternate History** — history diverges in a specified starting year and develops through a
  specified ending year, which may be past, present, or future.
- **Future Speculation** — the present develops toward a future horizon under one of four modes.

```
historical lineage (cached) + structured brief
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

- **Choose experiment** — enter the Alternate History or Future Speculation side of the app.
- **Generate** — choose a historical lineage and generate up to 20 structured variants. Alternate
  History includes `digital-media`, `vr`, `silicon-valley`, and a 67-event `world-war-ii`
  chronology covering 1933–1950. Future Speculation uses the first three lineages; corpus
  eligibility is declared in the corpus data, so the two lists can diverge. Future generation
  supports pivot-forward, endpoint-backcast, bounded-corridor, and open-exploration modes.
- **Render** — inspect complete World JSON and render selected worlds. The primary forms are
  `narrative-history` and `fiction`; shorter diagnostic forms are also retained. An optional render
  brief can specify focus, viewpoint, setting, tone, or emphasis without changing the World.
- **Library** — read renders and record `cohere`, `strain`, or `incoherent` judgments.
- **Clear everything** — deletes generated worlds and rendered artifacts together.

Generated worlds and artifacts are gitignored. Each saved World records the exact scenario brief,
history-corpus hash, model, prompt version, batch position, and API/cache token usage.

## World contents

Both World contracts contain:

- a premise distinguishing supplied conditions from model inferences;
- enabling assumptions with qualitative plausibility;
- exactly four historical forces stating how cited legacies enable, constrain, or redirect the World;
- an exactly nine-event causal timeline;
- a mature endpoint state covering technology, entertainment, social media, institutions,
  economics, access, and conflict;
- continuities with actual history;
- unresolved tensions that renderers can translate into histories, characters, and situations.

World fields deliberately use compact factual phrases rather than publication-ready prose. Fictional
characters, scenes, and plots are invented only during rendering.

Alternate-history timeline events distinguish `retained`, `altered`, and `invented`; future events
distinguish `continuation`, `adaptation`, and `novel`. `sourceRefs` must
match exact IDs in the selected historical corpus, and `causedBy` must point to assumptions or
earlier timeline events. The application audits these rules after generation. A World with semantic
problems is still saved, visibly marked with warnings, and accompanied by a diagnostic file for
later prompt and validator improvement. There is no automatic semantic-regeneration call.

At render time, the application resolves only the corpus events cited by the World. Narrative
histories use them to explain path dependence and transformation. Fiction uses the resulting
historical forces indirectly through mature technologies, institutions, habits, infrastructure,
and conflicts rather than recounting background history.

See [`sampling/WORLD-CONTRACT.md`](sampling/WORLD-CONTRACT.md) and
[`sampling/FUTURE-CONTRACT.md`](sampling/FUTURE-CONTRACT.md) for the contracts, and
[`sampling/README.md`](sampling/README.md) for the module map.

## Future modes

- **Pivot forward** — user supplies a near-term pivot; the endpoint may emerge.
- **Endpoint backcast** — user supplies the horizon condition; the model infers a pivot and prerequisites.
- **Bounded corridor** — user supplies both pivot and target condition.
- **Open exploration** — the brief and lineage bound the question; the model infers both.

The interface activates, disables, and marks the pivot and target fields according to the mode.
