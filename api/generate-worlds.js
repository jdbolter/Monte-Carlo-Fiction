// POST /api/generate-worlds  { themeId, count, startSeed? }
// Pure worldgen — no AI calls, fast and free. Saves each world to
// data/worlds/<themeId>/ and returns a diversity report alongside them.
import { loadTheme } from '../engine/theme-loader.js';
import { generateWorldBatch, saveWorld } from '../engine/worldgen.js';
import { diversityReport } from '../engine/validate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { themeId, count, startSeed } = req.body || {};
  if (!themeId || !count) {
    return res.status(400).json({ error: 'Missing required fields: themeId, count' });
  }

  try {
    const theme  = loadTheme(themeId);
    const worlds = generateWorldBatch(theme, Number(count), Number(startSeed) || 1);
    worlds.forEach(saveWorld);

    const report = diversityReport(worlds, theme.config.axes, theme);

    return res.status(200).json({ worlds, report });
  } catch (err) {
    console.error('[generate-worlds] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
