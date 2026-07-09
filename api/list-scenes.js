// GET /api/list-scenes?theme=<themeId>
import { listSceneScripts } from '../engine/render-visual.js';

export default async function handler(req, res) {
  const themeId = req.query?.theme;
  if (!themeId) {
    return res.status(400).json({ error: 'Missing query param: theme' });
  }

  try {
    const sceneScripts = listSceneScripts(themeId).sort((a, b) => a.worldId.localeCompare(b.worldId));
    return res.status(200).json({ sceneScripts });
  } catch (err) {
    console.error('[list-scenes] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
