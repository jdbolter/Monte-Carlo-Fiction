# History corpus contract

A history corpus is stable evidence supplied verbatim to the World-generation model. It is not a
precomputed alternate history, a branch tree, or a list of outcomes. The model may retain, alter,
delay, combine, or omit its events after the user-stipulated divergence.

Place each corpus at:

```text
sampling/history/<corpus-id>.json
```

`<corpus-id>` is the filename without `.json`. It must contain only lowercase letters, numbers,
and hyphens. The server discovers valid files automatically; no registry or interface edit is
required.

## Copyable minimum

```json
{
  "corpus": "history-of-example-domain",
  "displayName": "Example Domain",
  "purpose": "A received history of the domain, selected as causal evidence for alternate histories.",
  "experiments": ["alternate-history"],
  "sourceNote": "A synthesis of reputable secondary histories and reference works.",
  "sources": [
    {
      "title": "A Good Secondary History",
      "author": "Author Name",
      "publisher": "Publisher",
      "url": "https://example.org/optional-stable-source"
    }
  ],
  "tagLegend": {
    "institutions": "organizations, governance, and durable rules",
    "technology": "tools, infrastructure, and technical capabilities",
    "public-response": "adoption, resistance, controversy, and cultural meaning"
  },
  "events": [
    {
      "id": "first-causal-anchor",
      "year": 1950,
      "display": "1950–1952",
      "label": "Short Human-Readable Event Name",
      "tags": ["institutions", "technology"],
      "description": "Concise factual account of what changed and why it matters to the domain."
    },
    {
      "id": "second-causal-anchor",
      "year": 1953,
      "display": "May 1953",
      "label": "A Later Event",
      "tags": ["public-response"],
      "description": "Another established event that gives a generator useful causal material."
    }
  ]
}
```

## Fields

| Field | Status | Meaning |
|---|---|---|
| `corpus` | required | Stable descriptive name stored in API metadata. |
| `displayName` | optional | Human-readable interface label. The filename is title-cased when omitted. |
| `purpose` | required | One paragraph defining scope, selection principle, and intended use. |
| `experiments` | optional | Any non-empty subset of `alternate-history` and `future`. Omission enables both. |
| `sourceNote` | recommended | Research method and evidentiary limits. |
| `sources` | recommended | Bibliographic objects. `title` is expected; `author`, `publisher`, and `url` are optional. |
| `tagLegend` | recommended | Definitions for the thematic tags used by events. |
| `events` | required | Non-empty array of historical event objects. |

Each event requires:

| Field | Rule |
|---|---|
| `id` | Unique lowercase kebab-case. This is the exact value generated Worlds use in `sourceRefs`. Never rename it after Worlds have been saved. |
| `year` | Integer anchor year used for corpus metadata and model reasoning. For a range, use its causal starting or conventional anchor year. |
| `display` | Human-readable date or range, such as `1939–1940` or `6 June 1944`. |
| `label` | Short, recognizable event name. |
| `tags` | Array of compact thematic tags. Prefer tags defined in `tagLegend`. |
| `description` | Concise factual summary explaining what happened and its significance. |

Events should be arranged in nondecreasing year order. Multiple events in the same year are valid.
The loader does not require the corpus to cover the user's entire scenario interval: the model may
interpolate or extrapolate, but it can cite only event IDs actually present in the corpus.

## Selection and research guidance

- Establish the received narrative rather than performing original archival research.
- Prefer reputable secondary histories, scholarly syntheses, museum/reference timelines, and
  stable institutional histories.
- Select causal anchors, not every date. Include capabilities, institutions, laws, economic
  arrangements, public reception, resistance, failures, harms, and international context where
  relevant.
- Avoid a timeline made entirely of famous victories, product releases, or elite decisions.
- Keep entries factual. Do not write counterfactual branches, predicted consequences, fictional
  characters, or proposed World outcomes into the corpus.
- Give an event enough context to remain intelligible when a renderer later receives it alone.
- Roughly 40–80 well-selected events has worked for current corpora, but there is no enforced
  count. The complete JSON is sent to the model, so unnecessary length increases input and cache
  creation tokens.
- Treat dates and claims conservatively. Use `display` to preserve uncertainty or ranges while
  keeping `year` an integer.

## Installation and verification

1. Save the JSON file under `sampling/history/`.
2. Run:

```bash
npm run validate:corpora
npm test
```

3. Start the app with `npm run dev`.

The new corpus will appear automatically in every experiment named by `experiments`. A corpus
without a hand-authored interface draft receives safe generic defaults: Alternate History uses its
first and last event years with a blank scenario brief; Future Speculation uses open exploration,
the later of the current year or last event year as its base, a twenty-year horizon, and a blank
brief. The user must supply a substantive brief before generation.

## Prompt for another coding model

```text
Create a new historical corpus for this repository.

1. Read sampling/HISTORY-CORPUS-CONTRACT.md completely.
2. Inspect one or two relevant files in sampling/history/ as structural examples, but research the
   requested domain independently from reputable secondary histories and reference works.
3. Create only sampling/history/<requested-id>.json unless documentation corrections are genuinely
   necessary.
4. Establish a received factual chronology, not a counterfactual World. Select causal anchors across
   institutions, capabilities, economics, public response, resistance, failures, harms, and context.
5. Use stable unique event IDs and declare the intended experiments explicitly.
6. Run npm run validate:corpora and npm test. Fix every failure.
7. Report the event count, year range, experiment eligibility, principal sources, and any important
   omissions or judgment calls. Do not call a World-generation API.
```

## Compatibility boundaries

The corpus contract is domain-neutral, but the current World output contracts are not completely
domain-neutral. Their endpoint sections still emphasize technical systems, entertainment, social
media, institutions/economy, and access/conflict, and parts of the generation prompt assume a media
ecology. A political, military, scientific, or biographical corpus loads correctly, but testing may
show that its generated Worlds need a future revision of the endpoint schema or a domain profile.

Corpus JSON is input evidence. Do not copy fields from `alternate-history.v1` or `future.v1` World
records into it. Those records are model output documented separately in
[`WORLD-CONTRACT.md`](WORLD-CONTRACT.md) and [`FUTURE-CONTRACT.md`](FUTURE-CONTRACT.md).
