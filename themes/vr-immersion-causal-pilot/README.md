# VR & Immersive Media — Causal Pilot

This is the first active schema-v2 theme. It is intentionally separate from `themes/vr-immersion`, which remains an unchanged schema-v1 comparison theme.

The pilot contains 17 events spanning 1861–2025, 23 typed facts, six trajectory axes, and explicit canonical as well as counterfactual outcomes. Its causal claims and numeric weights are provisional adaptations of the research already recorded in `themes/vr-immersion/milestones.json`; they have not received a new source audit.

The default mode is `limited` with one to three divergences. Change `worldgen.divergencePolicy` in `theme.config.json` to run `baseline`, `single`, `naturalistic`, or `all-counterfactual` comparison batches.

Run a free batch with:

```sh
npm run generate -- --theme vr-immersion-causal-pilot --count 100
```

Every saved world includes its chosen outcome, state before and after each event, applied effects, eligibility trace, terminal state, and causal replay-validation result.
