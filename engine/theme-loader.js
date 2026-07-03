// =========================================
// engine/theme-loader.js — reads a theme folder from themes/<id>/
// into the plain objects worldgen.js and render.js expect.
// =========================================

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const THEMES_ROOT = join(__dirname, '..', 'themes');

export function listThemeIds() {
  return readdirSync(THEMES_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name);
}

export function loadTheme(themeId) {
  const dir = join(THEMES_ROOT, themeId);
  if (!existsSync(dir)) {
    throw new Error(`Theme "${themeId}" not found under themes/`);
  }

  const config     = JSON.parse(readFileSync(join(dir, 'theme.config.json'), 'utf8'));
  const milestones = JSON.parse(readFileSync(join(dir, 'milestones.json'), 'utf8')).milestones;

  let framework = null;
  const frameworkPath = join(dir, 'framework.json');
  if (existsSync(frameworkPath)) {
    framework = JSON.parse(readFileSync(frameworkPath, 'utf8'));
  }

  return { id: themeId, config, milestones, framework };
}

export function themeSummary(themeId) {
  const { config } = loadTheme(themeId);
  return {
    id: themeId,
    name: config.name,
    description: config.description,
    axes: config.axes
  };
}
