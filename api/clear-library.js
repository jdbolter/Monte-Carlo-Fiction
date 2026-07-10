// POST /api/clear-library  { themeId }
// Deletes every rendered story and scene script for a theme. Does not
// touch data/worlds/ — the worlds themselves are untouched and can be
// re-rendered from scratch.
import { clearStories } from '../engine/render-verbal.js';
import { clearSceneScripts } from '../engine/render-visual.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { themeId } = req.body || {};
  if (!themeId) {
    return res.status(400).json({ error: 'Missing required field: themeId' });
  }

  try {
    const storiesDeleted = clearStories(themeId);
    const scenesDeleted = clearSceneScripts(themeId);
    return res.status(200).json({ storiesDeleted, scenesDeleted });
  } catch (err) {
    console.error('[clear-library] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
