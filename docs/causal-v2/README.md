# Causal theme schema v2 — design spike

Status: **design only, not connected to the running application**.

The files in this directory define the proposed version-2 causal theme format before any engine or theme migration begins. They deliberately live outside `themes/`, because the current theme loader treats every non-underscore theme folder as a runnable legacy theme.

The spike answers four questions:

1. How can a chosen outcome change machine-readable world state?
2. How can canonical history remain available as an explicit control outcome?
3. How can event eligibility use time windows and causal preconditions instead of a four-digit-year comparison?
4. What information must a generated world retain so its causal consistency can be validated?

## Files

- `causal-theme-config.schema.json` — JSON Schema for versioning, axes, and divergence policy.
- `state-registry.schema.json` — JSON Schema for the controlled axis/fact vocabulary.
- `causal-events.schema.json` — JSON Schema for a version-2 event file.
- `pilot-theme-config.example.json` — proposed theme-version and divergence-policy configuration.
- `vr-state-registry.example.json` — controlled vocabulary for the pilot's trajectory axes and typed facts.
- `vr-events.example.json` — three worked branch points (Holmes, Lumière, Sensorama) plus the dependent events needed to demonstrate eligibility.
- `sample-world.example.json` — an illustrative generated trace using three noncanonical outcomes.

None of these files changes current seeded output. The existing `vr-immersion` and `silicon-valley` themes remain schema version 1 and continue through the current selector.

## Runtime compatibility proposal

Task 2 should dispatch by an explicit `schemaVersion`:

- missing or `1`: legacy `MilestoneSelector`, with its RNG call sequence unchanged;
- `2`: new causal selector, state registry, eligibility scheduler, and causal validation.

The v2 selector should normalize its output into the fields already consumed by the UI and renderers (`milestoneId`, `date`, `label`, `description`, `isBranchPoint`, `chosenAlternative`) while adding `chosenOutcome`, `stateBefore`, `stateAfter`, `appliedEffects`, and `eligibilityTrace`.

The sample world stores only facts that differ from registry defaults (`stateEncoding: "nonDefaultFacts"`), keeping the trace auditable without repeating every default value at every step.

## State model

Version 2 separates three things that the legacy trajectory vector currently blends together.

### 1. Typed causal facts

Facts describe concrete conditions that later events can test, such as:

- `cinema.exhibition_model = "private"`
- `stereoscope.ip_model = "licensed"`
- `sensorama.funding_model = "defense"`

Only keys declared in the theme's state registry are legal. This prevents model-assisted theme expansion from inventing several synonymous keys for the same concept.

### 2. Trajectory axes

Axes summarize a world for comparison and selection; they are not substitutes for facts. The proposed VR pilot uses six axes with explicit poles:

- `sensory_breadth`: optical/auditory only → multisensory/full-body
- `embodied_agency`: passive reception → bodily manipulation and feedback
- `sociality`: solitary use → collective or co-present experience
- `accessibility`: elite/specialized → affordable and broadly accessible
- `openness`: proprietary/controlled → open and interoperable
- `institutionalization`: fragile/individual → durably funded and institutionally embedded

Each event can have effects common to all outcomes. Each outcome then supplies its own `trajectoryDelta`, so choosing a counterfactual no longer applies the canonical outcome's vector.

### 3. Narrative consequences

Long-range implications that are plausible but too uncertain to enforce remain in `narrativeConsequences`. They can be given to the renderer without changing event eligibility.

## Effects: hard versus soft

An effect object can contain:

- `sets`: direct typed fact assignments;
- `trajectoryDelta`: per-axis numeric changes, normally -5 to +5 per event;
- `enables`: explicitly activates events whose `activation` is `explicit`;
- `disables`: prevents named events from occurring unless a future, deliberately authored effect reverses that state;
- `influences`: multiplies a candidate event's selection weight without making it certain or impossible.

Use hard effects only for direct dependencies. If an outcome merely makes something less likely, use an influence rather than `disables`. If the connection is primarily interpretive, retain it as a narrative consequence.

## Eligibility and time

Every event has a time window with ISO `earliest` and `latest` values plus the original human-readable date. An event is eligible when:

1. it has not occurred;
2. it is not disabled;
3. if `activation` is `explicit`, a prior outcome has enabled it;
4. its `latest` date has not passed;
5. its `requires` expression evaluates true.

Selecting an event advances the world clock to an occurrence inside its window. Other unvisited events in the same year remain eligible while their windows are still open, fixing the legacy selector's same-year exclusion.

`requires` supports fact comparisons, prior-event checks, and prior-outcome checks combined through `all`, `any`, and `none` arrays.

## Divergence policies

Canonical history is one explicit outcome at every branch point. The proposed policies are:

- `baseline`: always choose the canonical outcome;
- `single`: choose exactly one noncanonical outcome when at least one is reachable, then canonical outcomes thereafter;
- `limited`: choose between `minDivergences` and `maxDivergences` noncanonical outcomes;
- `naturalistic`: sample canonical and noncanonical outcomes from their authored weights;
- `all-counterfactual`: exclude canonical outcomes at every encountered branch, preserving the current experiment's premise as an available mode.

The pilot configuration proposes `limited` with one to three divergences. A 100-world comparison should also run `baseline`, `single`, and `all-counterfactual` so the effect of policy is visible rather than assumed.

## Validation contract for Task 2

Static theme validation should reject:

- unknown facts or axes;
- invalid fact values;
- nonexistent event/outcome references;
- more or fewer than one canonical outcome at a branch point;
- invalid or reversed time windows;
- explicit events that can never be enabled;
- contradictory effects that both enable and disable the same event in one outcome.

Per-world validation should verify:

- every selected event was within its time window;
- all preconditions were true immediately before selection;
- no disabled event occurred;
- every explicit event had been enabled;
- applied state changes match the chosen outcome;
- divergence count obeys the configured policy;
- the saved trajectory equals the sum of applied deltas.

Batch diagnostics should additionally report unreachable events, outcomes never sampled, frequently blocked preconditions, terminal-state diversity, and distributions of divergence count and point-of-divergence date.

## Research status of the examples

The worked events are schema examples derived from the current theme's milestone descriptions, requirements, and downstream effects. They are not a newly researched or source-audited historical model. Their `confidence`, `evidenceType`, `sourceRefs`, and `rationale` fields demonstrate how future model-assisted expansion should expose uncertainty rather than hide it.

The first Task-2 review should focus on whether the vocabulary and hard/soft boundary are right. Numerical weights and deltas are provisional tuning values.
