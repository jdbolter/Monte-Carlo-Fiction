import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../engine/worldgen.js';

test('schema-v1 engine compatibility remains available without an active legacy theme', () => {
  const theme = {
    id: 'legacy-fixture',
    config: {
      id: 'legacy-fixture',
      axes: ['axis'],
      startMilestoneId: 'start',
      stepsPerWorld: 2,
      worldgen: { topN: 1 }
    },
    milestones: [
      {
        id: 'start',
        date: '1900',
        label: 'Start',
        description: 'A legacy-format branch point.',
        category: 'test',
        is_branch_point: true,
        trajectory_contribution: { axis: 1 },
        branch_alternatives: [
          {
            id: 'alternate-start',
            description: 'The alternate start occurs.',
            plausibility: 'medium',
            requirement: 'A test condition.',
            downstream_effects: ['The legacy branch is retained.']
          }
        ]
      },
      {
        id: 'finish',
        date: '1901',
        label: 'Finish',
        description: 'A later legacy-format milestone.',
        category: 'test',
        is_branch_point: false,
        trajectory_contribution: { axis: 2 }
      }
    ],
    framework: null
  };

  const world = generateWorld(theme, 1);
  assert.equal(world.themeId, 'legacy-fixture');
  assert.equal(world.schemaVersion, undefined);
  assert.deepEqual(world.steps.map(step => step.milestoneId), ['start', 'finish']);
  assert.equal(world.steps[0].chosenAlternative.id, 'alternate-start');
});
