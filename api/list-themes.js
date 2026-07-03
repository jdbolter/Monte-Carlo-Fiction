// GET /api/list-themes — returns every theme under themes/ (except _template)
import { listThemeIds, themeSummary } from '../engine/theme-loader.js';

export default async function handler(req, res) {
  try {
    const ids = listThemeIds();
    const themes = ids.map(themeSummary);
    return res.status(200).json({ themes });
  } catch (err) {
    console.error('[list-themes] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
