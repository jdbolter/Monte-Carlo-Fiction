#!/usr/bin/env node
// =========================================
// scripts/generate-worlds.js — CLI wrapper around engine/worldgen.js
//
// Usage:
//   node scripts/generate-worlds.js --theme vr-immersion --count 100 [--start-seed 1]
//   npm run generate -- --theme vr-immersion --count 100
//
// Free and instant — no model calls. Prints a diversity report so you
// can decide whether the batch is worth rendering before spending money.
// =========================================

import { loadTheme } from '../engine/theme-loader.js';
import { generateWorldBatch, saveWorld } from '../engine/worldgen.js';
import { diversityReport } from '../engine/validate.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const themeId   = args.theme;
const count     = Number(args.count || 20);
const startSeed = Number(args['start-seed'] || 1);

if (!themeId) {
  console.error('Usage: node scripts/generate-worlds.js --theme <themeId> --count <n> [--start-seed <n>]');
  process.exit(1);
}

const theme  = loadTheme(themeId);
const worlds = generateWorldBatch(theme, count, startSeed);
worlds.forEach(saveWorld);

const report = diversityReport(worlds, theme.config.axes, theme);

console.log(`Generated ${worlds.length} worlds for theme "${themeId}" (seeds ${startSeed}-${startSeed + count - 1}).`);
console.log(`Saved to data/worlds/${themeId}/`);
console.log('');
console.log(`Chain diversity:    ${(report.chainDiversityRatio * 100).toFixed(0)}% unique milestone chains`);
console.log(`Unique endings:     ${report.uniqueTerminals}`);
console.log(`Repeated-ending rate: ${(report.repeatedEndingRate * 100).toFixed(0)}%`);
if (report.causalDiagnostics) {
  console.log(`Unique terminal states: ${report.causalDiagnostics.uniqueTerminalStates}`);
  console.log(`Unsampled events:     ${report.causalDiagnostics.unsampledEvents.length}`);
  console.log(`Unsampled outcomes:   ${report.causalDiagnostics.unsampledOutcomes.length}`);
  console.log(`Divergence counts:    ${JSON.stringify(report.causalDiagnostics.divergenceCountDistribution)}`);
}
if (report.flags.length) {
  console.log('');
  report.flags.forEach(f => console.log(`⚠ ${f}`));
}
