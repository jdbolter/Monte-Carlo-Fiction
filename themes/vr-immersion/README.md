# VR & Immersive Media

This is the active VR theme and uses schema v2 causal generation.

The theme contains 47 events spanning 1787–2026, 38 typed facts, six trajectory axes, and explicit canonical as well as counterfactual outcomes. It preserves the 42 events from the former milestone theme and retains the five explicit consequence events created for the original 17-event causal pilot. The deleted milestone source remains available in Git commit `ad6c18a`.

The original 17 causal events remain unchanged. The 30 later conversions are deliberately marked as provisional in their outcome rationales. Their source descriptions, branch alternatives, plausibility labels, requirements, and downstream consequences are inherited from the former milestone data. Their causal information was derived as a first pass:

- legacy `sensory`, `interaction`, and `scale` vectors map to `sensory_breadth`, `embodied_agency`, and `sociality`;
- `accessibility`, `openness`, and `institutionalization` values are description-based judgments;
- 15 additional typed facts record the state of panoramic spectacle, stereoscopic and multisensory cinema, synchronized sound, computer graphics, bodily game interfaces, Heilig's program, arts VR, founder control, and professional generative tools;
- branch alternatives use the existing requirement and downstream-effects prose, with typed state changes and 19 provisional six-axis vectors;
- long-range consequences use soft `influences` where the legacy evidence suggests increased or decreased likelihood; no new hard `disables` were inferred for the imported events.

These causal claims and numeric weights have not received a new source audit. They can be refined event by event without changing the engine or the stable event/outcome IDs.

The default mode is `limited` with one to three divergences. Change `worldgen.divergencePolicy` in `theme.config.json` to run `baseline`, `single`, `naturalistic`, or `all-counterfactual` comparison batches.

The prose renderer targets 900–1,100 words with a 2,600-token ceiling, giving multi-event causal paths room for explanation and sustained narrative development.

Run a free batch with:

```sh
npm run generate -- --theme vr-immersion --count 100
```

Every saved world includes its chosen outcome, state before and after each event, applied effects, eligibility trace, terminal state, and causal replay-validation result.
