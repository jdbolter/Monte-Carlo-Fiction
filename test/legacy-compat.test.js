import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTheme } from '../engine/theme-loader.js';
import { generateWorld } from '../engine/worldgen.js';

function signature(world) {
  return {
    steps: world.steps.map(step => [step.milestoneId, step.chosenAlternative?.id || null]),
    trajectory: world.trajectory,
    terminal: world.terminalProfile
  };
}

const EXPECTED = {
  'vr-immersion': {
    1: {
      steps: [
        ['barker-panorama-1787', 'panorama-becomes-mechanized'],
        ['daguerre-diorama-1822', null],
        ['wheatstone-stereoscope-1838', null],
        ['vitaphone-don-juan-1926', null],
        ['3d-golden-era-1952', '3d-boom-sustains'],
        ['beflix-bell-labs-1963', 'beflix-becomes-industry-standard'],
        ['lucasfilm-computer-division-1979', 'catmull-stays-academic-or-defense'],
        ['osmose-char-davies-1995', 'osmose-influences-consumer-vr'],
        ['oculus-kickstarter-2012', 'haptic-rift-parallel'],
        ['apple-vision-pro-2024', null]
      ],
      trajectory: { sensory: -24, interaction: -4, institutional: 0, scale: -3 },
      terminal: { milestoneId: 'apple-vision-pro-2024', label: 'Apple Vision Pro', date: '2024' }
    },
    2: {
      steps: [
        ['barker-panorama-1787', 'panorama-becomes-mechanized'],
        ['daguerre-diorama-1822', null],
        ['lumiere-cinematographe-1895', 'kinetoscope-model-prevails'],
        ['polarized-3d-features-1936', 'polarized-3d-arrives-in-hollywood-immediately'],
        ['cinerama-1952', 'cinerama-adds-haptics'],
        ['heilig-experience-theater-1964', 'nea-arts-funding'],
        ['reality-labs-losses-2022', null],
        ['horizon-worlds-reversal-2026', null]
      ],
      trajectory: { sensory: -5, interaction: -13, institutional: -6, scale: 11 },
      terminal: { milestoneId: 'horizon-worlds-reversal-2026', label: 'Horizon Worlds Shutdown-Then-Reversal', date: '2026' }
    },
    42: {
      steps: [
        ['barker-panorama-1787', 'panorama-becomes-mechanized'],
        ['wheatstone-stereoscope-1838', null],
        ['lumiere-cinematographe-1895', 'kinetoscope-model-prevails'],
        ['power-of-love-1922', 'power-of-love-succeeds-commercially'],
        ['3d-golden-era-1952', '3d-boom-sustains'],
        ['heilig-telesphere-1960', 'telesphere-tv-licensing'],
        ['toy-story-pixar-1995', 'cg-animation-stays-hybrid'],
        ['palmer-luckey-ousted-2017', 'luckey-stays'],
        ['apple-vision-pro-2024', null],
        ['horizon-worlds-reversal-2026', null]
      ],
      trajectory: { sensory: -22, interaction: -9, institutional: -13, scale: -3 },
      terminal: { milestoneId: 'horizon-worlds-reversal-2026', label: 'Horizon Worlds Shutdown-Then-Reversal', date: '2026' }
    }
  },
  'silicon-valley': {
    1: {
      steps: [
        ['deforest-vacuum-tube-1913', null],
        ['terman-encourages-entrepreneurship-1930s', null],
        ['hp-founded-1939', 'hp-acquired-early'],
        ['fairchild-traitorous-eight-1957', 'shockley-retains-team'],
        ['apple-founded-1976', 'apple-fails-to-find-early-investment'],
        ['a16z-founded-2009', 'platform-model-fails'],
        ['openai-founded-2015', 'openai-stays-nonprofit']
      ],
      trajectory: { capital: 3, founder_power: 18, openness: 7, scale: 3 },
      terminal: { milestoneId: 'openai-founded-2015', label: 'OpenAI Founded', date: '2015' }
    },
    2: {
      steps: [
        ['deforest-vacuum-tube-1913', null],
        ['hp-founded-1939', 'hp-acquired-early'],
        ['apple-founded-1976', 'apple-fails-to-find-early-investment'],
        ['a16z-founded-2009', 'platform-model-fails'],
        ['zirp-global-spread-2010s', 'rates-normalize-early'],
        ['openai-founded-2015', 'openai-stays-nonprofit'],
        ['genai-boom-2022-2024', 'incumbents-absorb-ai-boom']
      ],
      trajectory: { capital: 10, founder_power: 14, openness: 5, scale: 11 },
      terminal: { milestoneId: 'genai-boom-2022-2024', label: 'ZIRP Ends, AI Boom Begins', date: '2022-2024' }
    },
    42: {
      steps: [
        ['deforest-vacuum-tube-1913', null],
        ['terman-encourages-entrepreneurship-1930s', null],
        ['hp-founded-1939', 'hp-acquired-early'],
        ['dotcom-crash-2000', 'gradual-deflation'],
        ['y-combinator-2005', 'accelerator-model-fails'],
        ['a16z-founded-2009', 'platform-model-fails'],
        ['zirp-global-spread-2010s', 'rates-normalize-early']
      ],
      trajectory: { capital: -2, founder_power: 13, openness: 7, scale: -1 },
      terminal: { milestoneId: 'zirp-global-spread-2010s', label: 'ZIRP Capital and Global Spread of Valley Culture', date: '2010s' }
    }
  }
};

for (const [themeId, seeds] of Object.entries(EXPECTED)) {
  test(`legacy ${themeId} seeds retain exact structural output`, () => {
    const theme = loadTheme(themeId);
    for (const [seed, expected] of Object.entries(seeds)) {
      assert.deepEqual(signature(generateWorld(theme, Number(seed))), expected);
    }
  });
}
