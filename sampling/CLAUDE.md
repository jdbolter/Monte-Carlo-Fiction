# Sampling regime — operating manual & open questions

Read this before working in `sampling/`. This is a **parallel track** to the causal
engine (`../engine`, `../themes`, `../api`, `../server.js`), added on branch
`dev-claude-redesign`. It shares no code with the causal engine and does not touch it.
The causal `vr-immersion` / `silicon-valley` themes remain fully intact.

For the conceptual overview and quickstart, see `README.md` in this folder. This file is
the agent manual: architecture, the data contract, the decision log, and — most
importantly — the open questions.

---

## What this is (one paragraph)

Instead of walking a causal event graph forward (which converges on reality), we author
the **dimensions** of a media present and let a seeded RNG **sample the points**. A
configuration assigns one value per dimension; `ground` is our world's value; `k` is the
number of dimensions off ground. The model *rationalizes* a sampled configuration into a
coherent described present — it never chooses the destination. The intended payoff is
that the endpoint escapes both the author's and the model's priors, and the batch becomes
a map of the possibility space of presents rather than variations on the actual one.

## Architecture — free world-building, paid rendering

- **World-building (free, deterministic)** — no model calls. `sampler.js` seeds a k-targeted
  sample (`sampleExactK`/`sampleBatch`; `enumerateExactK` lists *every* config at low k — k=1=29,
  k=2=368). `backstory.js` selects grounding events per changed move. `world.js` `makeWorld()`
  fuses them into the **World object** (dimensions + facts + backstory). This is the model.
- **Rendering (paid)** — `render-config.js` takes a World and writes an artifact: builds the
  prompt from `world.facts` + `world.backstory`, forbids the dimension vocabulary, targets a
  `--form` (found-document / scene / testimony), calls the API with retry/backoff on 529 and a
  `--resume` skip. Saves each artifact as JSON + regenerates `worlds.md` (read) and `scorecard.md`
  (judge).
- **Interfaces** — `main-server.js` + `main/` is the main app (Generate / Render / Library) on
  :3000; `server.js` + `public/` is the single-page tuning bench on :4000. Both reuse the same
  world-building and rendering functions.

## Data contract: `media-present/dimensions.json` (v2)

Top-level `dimensions[]`. Each dimension:

- `id`, `label`, `description` — identity and a one-line sense.
- `exclusive` — `true` = the value strictly holds; `false` = **emphasis** (predominant,
  not an absolute exclusion; rival modes may persist in the background).
- `ordered` — `true` only for `resemblance` (a natural progression); metadata only, the
  sampler treats every dimension as a nominal set.
- `ground` — our world's value (must be one of `values`).
- `groundGloss` — optional qualifier on ground.
- `values[]` — the full option set (includes ground).
- `glosses{}` — short designer-facing descriptions for non-obvious / merged / renamed values.
- `worldFacts{}` — render-facing plain sentence per value; the changed values' worldFacts become
  the World's `facts` list. (Table is v3.)

The engine only *needs* `id`, `ground`, `values`; everything else feeds the render prompt.
The file is safe to hand-edit — keep valid JSON, keep `ground` ∈ `values`, and when
renaming a value update it in `values`, `glosses`, and `ground` together. Renaming changes
future output tags, so old renders won't line up with new names.

Current table: 9 dimensions. Emphasis: `attention_unit`, `sensory_register`,
`resemblance`, `provisioning`, `custody`. Exclusive: `authorship_distribution`,
`literacy_floor`, `compulsion`, `metering`.

## The render prompt (what the model is told)

`SYSTEM` in `render-config.js` asks for an ARTIFACT, not an essay, built from `world.facts` +
`world.backstory`. Three tuning levers (first-pass; iterate on the :4000 bench):
- **tone** — no dystopian default; varied, lived-in register.
- **lineage** — backstory is deep history; never depict old technology as current.
- **grain** — facts are the dominant grain of the culture's media, not literal rules for every
  message (news/weather still arrive normally).

Plus: forbid the dimension vocabulary entirely; honor emphasis (predominant) vs exclusive (flat).
Forms live in the `FORMS` map; `found-document` is the default and the strongest anti-jargon form.

## Decision log

- **Dropped 2 dimensions** after reading the first batch: `fidelity_criterion` and
  `address`. Down from 11 to 9.
- **Merges**: sensory haptic+proprioceptive → `haptic-proprioceptive-primary`; provisioning
  ads+purchase+subscription → `commercial-market`; authorship caste+hereditary →
  `caste-hereditary`; compulsion forbidden-to-some+forbidden-to-most → `forbidden-by-class`.
- **Renames for emphasis**: sensory `visual-only`/`auditory-only` → `visual-primary`/
  `auditory-primary` (the "-only" names were reading as exclusions on an emphasis
  dimension and confusing the model). Authorship ground `professional-caste` → `professional`.
- **exclusive vs emphasis flag added per dimension** (5 emphasis, 4 exclusive), plus the
  system-prompt rule that emphasis values are predominant, not absolute.
- **k=1–2 is the coherent band, not k=3–5.** Reading the first renders showed coherence
  depends on the moved dimensions forming a *thematic bundle*, not on the count. Two moves
  usually find a shared logic; three usually fragment. So cull hard, keep k low.
- **git split**: `sampling/outputs/*/*.json` and `worlds.md` are gitignored (costly,
  non-reproducible model output); `scorecard.md` is tracked (judgments = research data).

## How to run

See `README.md`. Free layer needs nothing; rendering needs `ANTHROPIC_API_KEY` in
`../.env.local`. Sonnet saturates during US working hours (529 Overloaded) — the renderer
retries with backoff, and `--model claude-haiku-4-5-20251001` routes around it.

---

## OPEN QUESTIONS (in priority order)

### 1. The render problem — the blocker

What comes out reads as **a hip media-studies essay about a possible future**, and it
**leans far too heavily on the dimension terminology** to be a real end product. The render
step hands the model the dimension vocabulary and asks it to rationalize, so the output
echoes that vocabulary and stays in an analytic register — it describes a present rather
than *being* an artifact from one. This must be solved before the pipeline is worth
scaling. Undecided and unbuilt. Directions to consider (none chosen):
- **Decide the target form first.** What is the end product — a short story set in the
  world, a design-fiction vignette, a first-person scene, a faux-primary-source document,
  an essay? The prompt can't be fixed until the genre is.
- **Forbid the scaffolding vocabulary.** Instruct the model never to name or paraphrase the
  dimensions; render lived experience, not analysis. Show, don't tell.
- **Two-stage render.** Stage 1 (hidden) derives the world's logic from the config; stage 2
  writes an artifact that never states that logic. Keeps coherence without exposing the
  machinery.
- **Character/scene over description.** Render an incident with a person in it rather than a
  survey of institutions.

**Progress 2026-07-17 (see `BACKSTORY.md`):** three candidate forms drafted (scene,
found-document, testimony) with reusable prompts, plus hand-rendered worked examples showing
the jargon problem disappears once the prompt forbids the dimension vocabulary and asks for an
artifact grounded in backstory. Found-document is the strongest anti-jargon form. Still to do:
Jay picks the form(s); write the value→plain-world-fact translation table; wire it into
`render-config.js`. This is now downstream of #3 (backstory) rather than independent of it.

### 2. VR (and other scenarios) — theme-specific tables vs. one general table

Jay's read: this `media-present` table, or a lightly modified form, could work for **VR**
— most of these dimensions plus a couple of VR-specific additions (candidates: presence,
embodiment, locomotion, social co-presence, passthrough/MR blend). **Silicon Valley** fits
this table less well; maybe a few dimensions carry over. The engine is already
theme-agnostic (sampler/render/UI just read *a* `dimensions.json`), so a new scenario = a
new table under `sampling/<theme>/` + a `?theme=` switch on the server/UI (not yet built).
Open: is VR its own table, or just a *region* of the media-present space (the corner where
sensory=haptic-proprioceptive, resemblance=hyperreal, custody=in-body, etc.)? Breadth vs.
depth, undecided.

### 3. History as backstory, not milestones

Jay wants to **work the causal engine's historical events into the generated stories as
backstory** — grounding a sampled present in a plausible invented history, rather than the
events being forward milestones. This would bridge the two tracks: the causal `events.json`
data becomes source material woven behind a dimension-sampled world. Unspecified: how to
select which events are relevant to a given configuration, and how to weave them without
reintroducing the reality-convergence the sampling regime was built to escape.

**Progress 2026-07-17 (see `BACKSTORY.md`):** prototyped. Two research-expanded backstory
corpora added — `history/vr.json` (~68 events, 1600s–2026) and `history/silicon-valley.json`
(~56 events, 1909–2024) — lighter than the causal `events.json` (date + description + tags
only), leaving the causal themes untouched. `backstory.js` selects events per off-ground move
via a provisional dimension→tag map, balanced across moves, deduped across corpora, with a
deep-root anchor; `node sampling/backstory.js --k 2 --seed 7` shows the selection. The brief
is meant to be injected into the render prompt as the world's real past (not milestones to
hit); the worked examples show it reading as texture rather than convergence. Not yet wired
into `render-config.js`. Bridge map + event tags are first-pass and worth review.

### 4. Coherence measurement / orthogonality harness — unbuilt

The `scorecard.md` verdicts are meant to feed a harness that aggregates by dimension-pair:
for each of the C(9,2)=36 pairs, what fraction of rendered worlds cohere? That matrix is
the empirical orthogonality test (the same test the old causal axes failed at r=0.67), now
on conceptual coherence. Not built. Note: raw sampled configs are independent *by
construction*, so the signal only appears once conditioned on coherence labels — the
harness organizes and aggregates, it does not judge.

### 5. Who filters, and at what scale

The model can't judge coherence (it rationalizes anything fluently). Discrimination stays
with Jay (the critic) or stays mechanical (a `requires`-style contradiction check catches
contradiction, not dullness). At k=2 the whole space is 368, so the reading load is
bounded but the "which few are provocative" selection is still human. Unsolved at scale.

### 6. Two systems or one

Does the causal engine survive as a distinct "pastcasting-from-a-fork" mode (a real forward
walk from a divergence point) alongside this dimension-sampling mode, or does sampling
replace it? Related to #2 and #3. Undecided.

### 7. Ongoing dimension refinement

Jay is still culling/adjusting values and glosses. The table is not frozen for good; treat
`media-present/dimensions.json` as live and expect edits.
