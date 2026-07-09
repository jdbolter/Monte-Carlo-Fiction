// GET /api/list-stories?theme=<themeId>
import { listStories } from '../engine/render-verbal.js';

export default async function handler(req, res) {
  const themeId = req.query?.theme;
  if (!themeId) {
    return res.status(400).json({ error: 'Missing query param: theme' });
  }

  try {
    const stories = listStories(themeId).sort((a, b) => a.worldId.localeCompare(b.worldId));
    return res.status(200).json({ stories });
  } catch (err) {
    console.error('[list-stories] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
