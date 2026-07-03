# Monte Carlo Speculative Worlds Strategy

## Purpose

This document outlines how to evolve this project from single-run workshop speculation into a repeatable system that can generate many alternative worlds and then run character stories inside those worlds.

Primary goal:
- Generate a large set of coherent alternate backgrounds (for example 100 worlds)
- Then run one or more characters against those backgrounds
- Compare outcomes across worlds

## Core Principle: JSON First, Prose Second

Do not start with narrative prose generation.

First generate structured world state in JSON, then render prose from that state.

Why this matters:
- You can audit causality and branching logic
- You can run Monte Carlo sampling and compare runs statistically
- You can reuse worlds for multiple character/story experiments
- You avoid beautiful but non-repeatable storytelling output

## Current Project Inputs (Reference)

Existing files already show the pattern:
- Milestone pool: [pastcasting/assets/data/vr-knowledge-milestones.json](pastcasting/assets/data/vr-knowledge-milestones.json)
- Framework and causal principles: [pastcasting/assets/data/vr-knowledge-framework.json](pastcasting/assets/data/vr-knowledge-framework.json)
- Selection logic: [pastcasting/js/selector.js](pastcasting/js/selector.js)
- Runtime orchestration: [pastcasting/js/main.js](pastcasting/js/main.js)
- Synthesis API and prompting: [api/synthesize.js](api/synthesize.js)

## Target Architecture

Two layers:

1. Worldline Generator Layer
- Produces many alternate history backgrounds
- Uses milestone graph, constraints, and stochastic selection
- Outputs structured JSON per run

2. Character Simulation Layer
- Runs character arcs inside a selected worldline
- Produces story events and narrative output
- Keeps character logic separate from world generation logic

## Phase 1: Build the Theme Knowledge Base

For each new theme (social, technical, political, cultural):

1. Gather source corpus
- One anchor history text plus supporting sources
- Use a research workspace (Obsidian or equivalent markdown corpus)

2. Distill into framework JSON
- Concepts
- Causal principles
- Era constraints
- Optional lineages/paradigms

3. Distill into milestones JSON
- Ordered inflection points
- Branch candidates
- Trajectory contributions

Deliverables:
- theme-framework.json
- theme-milestones.json

## Phase 2: Define Milestone Schema (Minimum Viable)

A milestone can be compact and still produce high variation.

Minimum fields:
- id
- date
- label
- description
- timeline
- is_branch_point
- trajectory_contribution

Recommended branch-only fields:
- branch_alternatives (2 to 4 options)
- era_constraints.available
- era_constraints.not_available
- downstream_effects

Guideline for diversity:
- 20 to 40 milestones total for initial experiments
- 30 to 50 percent marked as branch points
- Branch points distributed across the timeline (not clustered in one era)

## Phase 3: Monte Carlo World Generation

Generate many worlds without characters first.

Process:
1. Choose a seed strategy (fixed seed for reproducibility, random seed for exploration)
2. Run N simulations (for example N = 100)
3. Each simulation selects 6 to 10 milestones using weighted scoring and stochastic top-N selection
4. Record full transition trace
5. Save each world as JSON

Per-world output should include:
- world_id
- seed
- selected milestones
- chosen branch alternatives
- trajectory over time
- terminal world profile
- short generated summary text (optional)

## Phase 4: World Quality Checks

Before character stories, validate world set quality.

Checks:
- Chronological consistency
- Constraint violations (nothing impossible for the era)
- Diversity score (not all worlds converging on one ending)
- Branching entropy
- Timeline coverage
- Repeated ending rate

Filter out weak or duplicate worlds.

## Phase 5: Character Simulation on World Backgrounds

Now run characters against validated worlds.

Suggested process:
1. Define 2 to 4 character archetypes with explicit goals, values, and constraints
2. Select representative worlds (for example 10 to 20 sampled from the 100)
3. Run each character through each selected world
4. Save outcomes as structured runs plus narrative rendering

Run record should include:
- character_id
- world_id
- decision points
- conflicts and opportunities
- outcome metrics
- final narrative

## Phase 6: Analysis and Comparison

Analyze both worlds and character runs.

World-level analysis:
- Which branch points dominate outcomes
- Which constraints most shape world trajectories

Character-level analysis:
- How outcome changes across world contexts
- Which values/goals are robust versus fragile

Cross-layer analysis:
- Which world features strongly predict character success or failure

## Practical Repo Plan (New Experimental Repo)

Recommended folders:

- data/sources/ (raw source docs or extracted notes)
- data/knowledge/ (theme-framework.json, theme-milestones.json)
- data/worlds/ (generated world JSON files)
- data/characters/ (character definitions)
- data/runs/ (character-in-world simulation outputs)
- scripts/ (ingest, generate, validate, analyze)
- prompts/ (generation and evaluation prompts)
- docs/ (method notes and findings)

## Suggested Build Sequence

1. Build one new theme knowledge base
2. Generate 20 worlds and validate
3. Scale to 100 worlds
4. Add 2 characters and run pilot simulations
5. Add evaluation dashboard or reporting notebook

## Prompting Guidance

Use AI in staged passes, not one-shot generation.

Pass A: Extract timeline events from sources
Pass B: Convert events into milestone schema
Pass C: Propose branch alternatives and downstream effects
Pass D: Validate constraints and consistency
Pass E: Generate prose summaries from structured outputs

This staged approach gives better control and less hallucinated causality.

## Risks and Mitigations

Risk: Source bias from one text
- Mitigation: Use one anchor plus several supplementary sources

Risk: Path collapse (too many worlds end similarly)
- Mitigation: Increase branch density, adjust scoring weights, enforce diversity constraints

Risk: Narrative quality hides structural errors
- Mitigation: Always validate JSON state before prose rendering

Risk: Overfitting to one paradigm
- Mitigation: Include contrasting lineages and explicit negative scenarios

## Definition of Done for Version 1

You can call V1 successful when:
- You can generate 100 valid world JSON files from one theme corpus
- At least 70 percent of worlds are structurally distinct by your diversity metric
- You can run at least 2 characters across at least 10 worlds each
- You can produce a comparative report of outcomes

## Immediate Next Steps

1. Decide a first non-VR theme for the new repo
2. Assemble initial source corpus (1 anchor plus 3 to 8 supporting sources)
3. Draft theme-framework.json and theme-milestones.json
4. Implement a simple world generator script with deterministic seed support
5. Run a 20-world pilot and inspect diversity before scaling
