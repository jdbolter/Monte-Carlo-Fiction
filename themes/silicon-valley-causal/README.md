# Silicon Valley — Causal

Schema-v2 causal conversion of all 28 milestones in `themes/silicon-valley`, plus nine explicit consequence events derived from the legacy branch descriptions. The legacy theme is unchanged.

The conversion preserves source descriptions, alternatives, plausibility labels, requirements, and downstream consequences. Typed facts, two added axes (institutionalization and Valley concentration), outcome effects, eligibility links, and numerical weights are provisional and should be refined through later content review. Hard disables are used only for direct dependencies such as Apple failing before the iPhone or Shockley retaining the team that historically formed Fairchild; uncertain long-range effects remain soft influences.

Default generation uses limited divergence mode with one to three counterfactual outcomes and up to 12 events per world. Prose rendering targets 900–1,100 words.

The nine explicit consequence events cover alternate geographic clustering, a civilian Stanford research network, a dispersed Bay Area corridor, the Fairchild diaspora or its suppression, proprietary network services, closed mobile distribution, and concentrated or geographically distributed AI development. They occur only after an outcome explicitly enables them; every generated world is replay-validated against that history.

Selection tuning is deliberately theme-specific. `topN` is nine so negative shocks and institutional reversals can enter the shortlist despite opposing a boom-shaped accumulated trajectory. The dot-com crash has `baseWeight: 6` as editorial salience rather than a causal probability: at its default weight it was eligible but never selected in a 1,000-seed audit. This distinction should be revisited if the selector later gains a first-class event-salience field.

Audit on seeds 1–1,000 under the default limited policy: 1,000 distinct outcome paths, 998 distinct event chains, all 37 events and all 24 counterfactual outcomes sampled, 19 first-divergence dates, and 14 final milestones. The generative-AI boom remained the most common final milestone (611/1,000), which reflects the source theme's deliberate present-day convergence point rather than a causal-validation failure.
