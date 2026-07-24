# Monte-Carlo-Fiction

An experiment in generating structured alternate histories and future scenarios from researched
historical lineages, then selectively rendering the most interesting Worlds.

The opening screen separates two experiments that share a core pipeline:

- **Alternate History** — history diverges in a specified starting year and develops through a
  specified ending year, which may be past, present, or future.
- **Future Speculation** — the present develops toward a future horizon under one of four modes.

```
historical lineage (cached) + structured brief
    → distinct causal-route plan when more than one World is requested
    → model-generated World JSON
    → inspect and select
    → narrative history, fiction, scene, testimony, or found document
```

World generation now uses a model call because the central task is causal speculation: deciding
which real events survive, which change, what enabling conditions are required, and how the
institutions, practices, technologies, conflicts, and cultures develop across time. The historical
corpora remain the stable shared evidence. Compact structured worlds are generated first; longer
prose is purchased only for worlds worth rendering.

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

Validate every installed history corpus with:

```bash
npm run validate:corpora
```

## Interface

- **Choose experiment** — enter the Alternate History or Future Speculation side of the app.
- **Generate** — choose a historical lineage and generate one structured World by default, or up
  to 20 alternatives. Alternate History includes `digital-media`, `vr`, `silicon-valley`,
  `world-war-ii`, and `cold-war`. WWII covers 1933–1950; the Cold War corpus covers 1945–1993.
  Future Speculation uses the first three lineages; corpus eligibility is declared in the corpus
  data, so the two lists can diverge. Future generation supports pivot-forward,
  endpoint-backcast, bounded-corridor, and open-exploration modes.
- **Render** — inspect complete World JSON and render selected worlds. The primary forms are
  `narrative-history` and `fiction`; shorter diagnostic forms are also retained. An optional render
  brief can specify focus, viewpoint, setting, tone, or emphasis without changing the World.
- **Library** — read renders, save any complete rendered text as a paginated PDF, and record
  `cohere`, `strain`, or `incoherent` judgments.
- **Clear everything** — deletes generated worlds and rendered artifacts together.

Generated worlds and artifacts are gitignored. Each saved World records the exact scenario brief,
history-corpus hash, model, prompt version, batch position, assigned alternative route when
applicable, and API/cache token usage.

## Distinct alternatives

A request for one Alternate History World goes directly to World generation. A request for two or
more first makes one compact structured-output call that designs the requested number of distinct
causal routes. Each route states a causal thesis, decisive mechanisms, corpus events to transform,
and an expected endpoint difference. The application then assigns one route to each sequential
World-generation call.

The planner and World calls use the same system prompt and identical cached corpus prefix, allowing
the route-specific calls to reuse the cache created by planning. The assigned route is saved under
`provenance.alternativeRoute` and shown on the World card. The application does not score,
reject, compare, or automatically regenerate similar Worlds; that judgment remains with the user.

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

## Adding a historical timeline

New corpora are automatically discovered from `sampling/history/<corpus-id>.json`; no registry or
interface edit is required. The filename must use lowercase letters, numbers, and hyphens.

At minimum, a corpus supplies:

- `corpus`, `purpose`, and a non-empty `events` array;
- an optional `displayName`;
- an optional `experiments` allowlist containing `alternate-history`, `future`, or both—omitting it
  enables both experiments;
- unique event IDs in lowercase kebab-case;
- for every event, integer `year`, human-readable `display`, `label`, `tags`, and a concise factual
  `description`.

Event IDs are a durable API: generated Worlds cite them exactly in `sourceRefs`, so do not rename
them after Worlds have been saved. Arrange events chronologically; same-year events are allowed.
Use reputable secondary histories and reference timelines to establish a received narrative, and
select causal anchors rather than trying to include every date. Roughly 40–80 events has worked
well, but no count is enforced.

After adding a file, run:

```bash
npm run validate:corpora
npm test
```

The complete specification, copyable JSON template, research guidance, automatic UI-default
behavior, and compatibility caveats are in
[`sampling/HISTORY-CORPUS-CONTRACT.md`](sampling/HISTORY-CORPUS-CONTRACT.md).

The corpus input format is domain-neutral, but the current generated-World endpoint remains partly
oriented toward media and technology: technical systems, entertainment, social media,
institutions/economy, and access/conflict. WWII and other non-media corpora therefore also test
whether the World schema should acquire domain-specific endpoint profiles.

See [`sampling/WORLD-CONTRACT.md`](sampling/WORLD-CONTRACT.md) and
[`sampling/FUTURE-CONTRACT.md`](sampling/FUTURE-CONTRACT.md) for the contracts, and
[`sampling/README.md`](sampling/README.md) for the module map.

## Future modes

- **Pivot forward** — user supplies a near-term pivot; the endpoint may emerge.
- **Endpoint backcast** — user supplies the horizon condition; the model infers a pivot and prerequisites.
- **Bounded corridor** — user supplies both pivot and target condition.
- **Open exploration** — the brief and lineage bound the question; the model infers both.

The interface activates, disables, and marks the pivot and target fields according to the mode.
