// =========================================
// engine/theme-loader.js — reads a theme folder from themes/<id>/
// into the plain objects worldgen.js and render-verbal.js expect.
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
  return loadThemeDirectory(themeId, dir);
}

// Exported separately so schema-version loading can be tested against an
// isolated fixture without creating an auto-discovered theme under themes/.
export function loadThemeDirectory(themeId, dir) {
  const config = JSON.parse(readFileSync(join(dir, 'theme.config.json'), 'utf8'));

  let framework = null;
  const frameworkPath = join(dir, 'framework.json');
  if (existsSync(frameworkPath)) {
    framework = JSON.parse(readFileSync(frameworkPath, 'utf8'));
  }

  if (config.schemaVersion === 2) {
    const eventFile = config.eventFile || 'events.json';
    const registryFile = config.stateRegistryFile || 'state-registry.json';
    const eventDocument = JSON.parse(readFileSync(join(dir, eventFile), 'utf8'));
    const stateRegistry = JSON.parse(readFileSync(join(dir, registryFile), 'utf8'));
    if (eventDocument.schemaVersion !== 2 || eventDocument.themeId !== themeId) {
      throw new Error(`Causal event file must use schemaVersion 2 and themeId "${themeId}"`);
    }
    if (stateRegistry.schemaVersion !== 2 || stateRegistry.themeId !== themeId) {
      throw new Error(`State registry must use schemaVersion 2 and themeId "${themeId}"`);
    }
    return {
      id: themeId,
      schemaVersion: 2,
      config,
      events: eventDocument.events,
      stateRegistry,
      framework
    };
  }

  const milestones = JSON.parse(readFileSync(join(dir, 'milestones.json'), 'utf8')).milestones;
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
