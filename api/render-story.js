// POST /api/render-story  { themeId, worldId }
// The one place that spends tokens: loads a saved world and makes a
// single call to render it as prose, then saves the story to disk.
import { loadTheme } from '../engine/theme-loader.js';
import { loadWorld } from '../engine/worldgen.js';
import { renderStory, saveStory } from '../engine/render-verbal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { themeId, worldId, extrapolate, extrapolationYears } = req.body || {};
  if (!themeId || !worldId) {
    return res.status(400).json({ error: 'Missing required fields: themeId, worldId' });
  }

  try {
    const theme = loadTheme(themeId);
    const world = loadWorld(themeId, worldId);
    if (!world) {
      return res.status(404).json({ error: `World ${worldId} not found for theme ${themeId}` });
    }

    const story = await renderStory(theme, world, { extrapolate, extrapolationYears });
    saveStory(story);

    return res.status(200).json({ story });
  } catch (err) {
    console.error('[render-story] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
