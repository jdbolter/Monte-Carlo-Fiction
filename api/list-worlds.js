// GET /api/list-worlds?theme=<themeId>
import { listWorlds } from '../engine/worldgen.js';
import { listStories } from '../engine/render-verbal.js';
import { listSceneScripts } from '../engine/render-visual.js';

export default async function handler(req, res) {
  const themeId = req.query?.theme;
  if (!themeId) {
    return res.status(400).json({ error: 'Missing query param: theme' });
  }

  try {
    const worlds = listWorlds(themeId);
    const renderedIds = new Set(listStories(themeId).map(s => s.worldId));
    const sceneRenderedIds = new Set(listSceneScripts(themeId).map(s => s.worldId));
    const withStatus = worlds
      .sort((a, b) => a.seed - b.seed)
      .map(w => ({ ...w, hasStory: renderedIds.has(w.worldId), hasSceneScript: sceneRenderedIds.has(w.worldId) }));

    return res.status(200).json({ worlds: withStatus });
  } catch (err) {
    console.error('[list-worlds] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
