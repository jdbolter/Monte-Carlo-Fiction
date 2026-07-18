# Events as backstory + the render-form problem

*Working notes, 2026-07-17. Addresses open questions #1 (render output reads as a jargon
essay) and #3 (weave the historical events in as backstory, not milestones). Prototype
code: `backstory.js`; corpora: `history/vr.json`, `history/silicon-valley.json`.*

---

## The two problems are one fix

The current render output reads as "a hip media-studies essay about a possible future"
because a sampled present has **no history to stand on**. Handed only a configuration, the
model can do nothing but *describe the configuration* — so it names the dimensions, stays
analytic, and never becomes an artifact. Grounding each present in **real historical events
as backstory** gives the render concrete texture to write from, and lets it stop describing
and start depicting. So events-as-backstory (#3) is the lever on the render problem (#1).

## The mechanism (free, deterministic — `backstory.js`)

The real events are the **shared past**; a sampled present is a **divergence** from it. For
each of a present's off-ground moves, we pull the historical events whose themes *rhyme*
with that move, drawing from both lineages at once:

- Two research-expanded corpora under `history/`: **`vr.json`** (immersive/visual media,
  ~68 events, 1600s–2026) and **`silicon-valley.json`** (computing / capital / networks,
  ~56 events, 1909–2024). Both are lighter than the causal engine's `events.json` — date,
  description, and thematic **tags** only — and the causal themes are left untouched.
- A provisional **dimension→tag map** (in `backstory.js`) says which corpus tags each
  off-ground value resonates with (e.g. `custody=in-body-mortal` → `wearable-body,
  embodiment`; `authorship=universal` → `open, mass-access`).
- Selection is **balanced across the moves** (each move gets its own resonant events, so
  the move with more tags can't dominate), deduped across corpora, and anchored with one
  deep-root event so the backstory has historical depth. Output: a chronological brief.

Inspect it: `node sampling/backstory.js --k 2 --seed 7 --configs 3`. Example — the present
`{resemblance=hyperreal, custody=personal-possession}` pulls the immersion lineage (camera
obscura → Barker's panorama → phantasmagoria) *and* the personal-ownership lineage
(Engelbart's demo → Homebrew Computer Club → Apple). The brief is then injected into the
render prompt as the world's actual past.

## The render-form fix

Two changes, on top of the backstory:

1. **Decide the target form.** The prompt can't be fixed until we know what the end product
   *is*. Three candidates are drafted below. This is the decision that gates everything.
2. **Forbid the scaffolding vocabulary.** The model must never name or paraphrase the
   dimensions. It is handed the off-ground moves **translated into plain world-facts**, plus
   the backstory, and told to depict, not analyze.

### Candidate form prompts (reusable)

**A — Scene.** *"Write a single scene, ~350 words, set in the present described by the
world-facts below and grounded in the history below. Put one ordinary person in it doing an
ordinary thing. Convey how this world works only through what they do, see, and take for
granted — never explain it. Do not use analytic or media-studies vocabulary; do not name any
'dimension' or 'value.' The history is this world's real past: let it show as texture
(objects, habits, references characters would actually make), never as a lecture."*

**B — Found document.** *"Write a single primary-source document from inside this present,
~250 words — a notice, listing, warranty, syllabus, obituary, ration card, or letter. It
should read as genuine found material: no framing, no explanation, only the document. The
world's rules are implicit in its form and details. The history below is real precedent this
document can assume its reader knows."*

**C — Testimony.** *"Write ~300 words of first-person testimony from someone describing their
ordinary media life, unaware that any of it is unusual. Plain speech, concrete particulars.
The history below is the past they grew up after. Never name the underlying logic; let it
sit in what they consider normal."*

---

## Worked examples (hand-rendered, no API)

These were written by hand to show what each form yields. The off-ground moves are given as
world-facts; dimension names never appear in the output.

### Example A — `resemblance=hyperreal`, `custody=personal-possession`

*World-facts:* images reach the highest possible fidelity and envelopment; and people **own**
their media outright — held, shelved, resold, inherited — rather than renting access from
remote platforms. *Backstory selected:* camera obscura, Barker's panorama, phantasmagoria
(engineered immersion) + Mother of All Demos, Homebrew Computer Club, Apple (personal
possession of the machine).

**A0 — the current failure mode (what we're trying to leave behind):**

> In this media present, the resemblance dimension shifts to hyperreal while custody moves
> from remote tenancy toward personal possession. The emphasis on owned, maximally immersive
> imagery means the platform-tenancy model recedes: media is decommodified as an access
> relation and recommodified as an object. One reading is a restoration of ownership; another
> is a new scarcity…

*(Analytic, names its own machinery, describes rather than depicts. This is the problem.)*

**A1 — Scene:**

> Mara took the pane down from the second shelf, the one she'd bought used off a man in
> Reseda who'd needed the money. You could still feel where his thumb had worn the frame.
> She set it upright on the table, tapped the corner, and the kitchen went out from under
> her — she was standing on the seawall at Trebizond, gulls close enough to smell, the light
> so total that her actual hand, reaching, threw a shadow into it. Her mother used to say the
> old panorama halls did this to people, a whole rotunda painted so well that farmers grabbed
> the railings. This was better and it was hers. Nobody could reach into the pane and take it
> back the way the streaming years had taught everyone to expect — the mornings when a film
> you'd paid for was simply gone, licensed away overnight. Her father's generation had hated
> that enough to build their own machines in garages, and their children had bought the panes
> outright the first year you could, and now Mara owned forty of them, an estate really, the
> good ones appreciating. She stepped back into the kitchen. The seawall held on the table,
> waiting, patient as a photograph, except you could walk into it. She'd leave it to her
> daughter, or sell it if the roof needed doing. Either way it was a thing you could hold,
> and that, her mother said, was the whole point of surviving the tenancy years.

**A2 — Found document (a provenance certificate):**

> **CERTIFICATE OF TITLE AND PROVENANCE — Immersive Plate No. 4471-C**
> "Seawall, Trebizond (Morning)." Full-envelopment capture, sensory-complete.
> Struck from master by the Holloway atelier; edition of 300, this being No. 218.
>
> Chain of possession: Holloway atelier (orig.) → E. Voss, Reseda → M. Okonkwo (present
> holder), by private sale, cash. No lien, no remote dependency, no revocation clause. This
> plate resolves and displays without connection to any external service and cannot be
> recalled, updated, or expired by any party. Title transfers with the physical plate.
>
> Purchasers are reminded that immersive plates are personal property under the Possession
> Acts and pass by inheritance. The atelier disclaims the practice — dating to the streaming
> era — of representing access as ownership. What you hold, you hold.

### Example B — `attention_unit=congregation`, `literacy_floor=model-train`

*World-facts:* media is attended to **collectively**, in gathered bodies (halls, clubs,
parties); and the baseline competence everyone is assumed to have is the ability to **train
and steer generative models** — the way we assume reading. *Backstory selected:* the
collective-spectacle lineage (camera obscura, magic lantern, Barker) + Weinbaum's
"Pygmalion's Spectacles" + Genie-class world models / World Labs.

**B — Testimony:**

> Thursdays I go to the hall on Crenshaw — my mother's local, I inherited the seat. Forty of
> us, maybe fifty when the weather's bad and people want the company. You don't watch anything
> there; that's for children and shut-ins. You *build*. The elders open a seed — last week it
> was a river delta, nothing much, brown water and reeds — and then everyone leans in and
> starts steering it, the way you'd all sing the same hymn but each carry your own line. Old
> Perpetua is the best of us; she can take a flat gray model and coax weather into it, real
> weather, until you feel the pressure drop and somebody laughs because their knees ache in
> the storm that isn't there. My grandfather says people used to do this alone, each in a
> separate room, renting the worlds one at a time from a company. Sounds like hell to me —
> like praying alone. We learn to steer before we learn much else; a child who can't shape a
> model by nine is watched the way you'd watch a child who couldn't read. There's an old story
> they teach, about a man with a pair of spectacles that gave him a whole world to himself, and
> how it drove him half-mad with loneliness. We tell it as a warning. A world is something you
> raise together, in a room, with your neighbors' hands in it.

---

## What the examples suggest

- The form change alone does most of the work. The same two moves that produced A0 (jargon)
  produce A1/A2 once the prompt forbids the vocabulary and asks for an artifact.
- The backstory earns its keep as **texture, not exposition** — "the old panorama halls,"
  "renting the worlds one at a time," the Weinbaum story retold as folk warning. The selected
  events surface as things characters *reference*, which is exactly the register we want.
- **Found document (B/A2) is the strongest anti-jargon form** — a document literally cannot
  lapse into media-studies analysis, because documents don't analyze themselves. Scene and
  testimony are close behind. The essay form should probably be retired as an end product,
  even if it's useful internally.

## Open sub-questions (carried forward)

1. **Pick the form(s).** Scene / found-document / testimony — or a rotation. Jay's call; it
   gates the render rewrite. (Recommendation: found-document + scene.)
2. **Two-stage render.** Should stage 1 derive the world's logic privately and stage 2 write
   the artifact blind to that logic, to guarantee no leakage? The hand examples suggest the
   single-stage forbidden-vocabulary prompt may be enough, but this is untested against a live
   model.
3. **World-fact translation.** The moves must be handed to the model as plain world-facts, not
   value ids. That translation table (value → one plain sentence) is not yet written; the
   glosses in `dimensions.json` are a start.
4. **Backstory bridge is provisional.** The `DIMENSION_TAG_MAP` and the event tags are
   first-pass judgments. Values that map to no tags (e.g. `resemblance=cartoon`,
   `literacy=read-only`) yield thin backstory — arguably a correct signal, but worth review.
5. **Which corpus, when.** Right now both pools are searched together and the best matches
   win, which is why A1 blends immersion and personal-computer history. If a present should
   draw from only one lineage, that needs a rule.
6. **Not wired into the renderer yet.** `render-config.js` does not call `backstory.js`. Next
   build: inject the assembled brief + world-facts into the prompt, behind the chosen form.
