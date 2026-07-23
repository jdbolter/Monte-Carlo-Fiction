import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = join(__dirname, 'history');

export function listCorpora() {
  return readdirSync(HISTORY_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const id = file.replace(/\.json$/, '');
      const corpus = loadCorpus(id);
      const years = corpus.events.map(event => event.year).filter(Number.isFinite);
      return {
        id,
        name: corpus.corpus || id,
        purpose: corpus.purpose || '',
        eventCount: corpus.events.length,
        firstYear: Math.min(...years),
        lastYear: Math.max(...years)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function loadCorpus(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error(`Invalid history corpus id: ${id}`);
  return JSON.parse(readFileSync(join(HISTORY_DIR, `${id}.json`), 'utf8'));
}

export function loadCorpusSource(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error(`Invalid history corpus id: ${id}`);
  return readFileSync(join(HISTORY_DIR, `${id}.json`), 'utf8');
}

export function corpusHash(source) {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

export function corpusEventIds(corpus) {
  return new Set(corpus.events.map(event => event.id));
}

export function resolveCorpusEvents(id, refs = []) {
  const wanted = new Set(refs);
  if (!wanted.size) return [];
  return loadCorpus(id).events
    .filter(event => wanted.has(event.id))
    .map(({ id: eventId, year, display, label, description }) => ({
      id: eventId,
      year,
      display,
      label,
      description
    }));
}
