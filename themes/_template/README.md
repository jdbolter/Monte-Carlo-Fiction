# Adding a new theme

Copy this `_template/` folder to `themes/<your-theme-id>/` and edit the three files inside. The engine (`engine/`) never changes — it just reads whatever a theme provides.

## theme.config.json

Top-level settings for this theme.

- `id` — matches the folder name
- `name`, `description` — human-readable
- `axes` — 3-5 short names for the trajectory vector this theme tracks. Pick axes that are meaningful tensions for your domain (the VR theme uses `sensory`/`interaction`/`institutional`/`scale`; a different theme should invent its own).
- `categoryField` — defaults to `"category"`. Only change this if your milestones.json uses a different key for the parallel-thread grouping.
- `startMilestoneId` — the id of the milestone every world starts from.
- `stepsPerWorld` — how many milestones a single world visits (6-10 is reasonable).
- `worldgen` — tuning knobs: `topN` (how many top-scored candidates to sample from at each step), `branchPointBonus`, `crossCategoryBonusEvery`.
- `render` — which model to use for prose rendering, max_tokens, and target word count range.

## milestones.json

An array of inflection points. Minimum viable fields per Phase 2 of `MONTE_CARLO_STRATEGY.md`:

- `id`, `date`, `label`, `description`
- `category` — which parallel thread this belongs to (optional if your theme has only one thread)
- `is_branch_point` — boolean
- `trajectory_contribution` — object keyed by your theme's `axes`, values roughly -5 to +5

Branch-point-only fields:

- `branch_alternatives` — 2-4 objects, each with `id`, `description`, `plausibility` (`low`/`low-medium`/`medium`/`high`), `requirement`, `downstream_effects` (array of strings)
- `era_constraints` — `{ available: [...], not_available: [...] }`, used only to keep prose plausible, not used in scoring

Guideline: 20-40 milestones, 30-50% marked as branch points, spread across the whole timeline rather than clustered.

## framework.json (optional)

Short, hand-written context injected into every render call — much shorter than a full research wiki dump. Structure:

```json
{
  "lineages": { "paradigm-a": "one paragraph", "paradigm-b": "one paragraph" },
  "causal_principles": ["short causal rule 1", "short causal rule 2"],
  "voice_guidance": "one or two sentences on tone/register for this theme's fiction"
}
```

If you skip this file entirely, rendering still works — it just won't have theme-specific framing beyond the milestone descriptions themselves.

## After adding a theme

No registration step needed — `engine/theme-loader.js` discovers every folder under `themes/` (except folders starting with `_`) automatically. It'll show up in the web UI's theme picker and in `generate-worlds --theme <id>`.
