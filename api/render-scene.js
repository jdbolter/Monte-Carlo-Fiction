// POST /api/render-scene  { themeId, worldId }
// The visual-render sibling to /api/render-story: loads a saved world and
// makes a single call to render it as a scene script, then saves it to disk.
import { loadTheme } from '../engine/theme-loader.js';
import { loadWorld } from '../engine/worldgen.js';
import { renderSceneScript, saveSceneScript } from '../engine/render-visual.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { themeId, worldId } = req.body || {};
  if (!themeId || !worldId) {
    return res.status(400).json({ error: 'Missing required fields: themeId, worldId' });
  }

  try {
    const theme = loadTheme(themeId);
    const world = loadWorld(themeId, worldId);
    if (!world) {
      return res.status(404).json({ error: `World ${worldId} not found for theme ${themeId}` });
    }

    const sceneScript = await renderSceneScript(theme, world);
    saveSceneScript(sceneScript);

    return res.status(200).json({ sceneScript });
  } catch (err) {
    console.error('[render-scene] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
