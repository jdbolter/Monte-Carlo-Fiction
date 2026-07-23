import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_DIR = join(__dirname, 'history');
const EXPERIMENTS = new Set(['alternate-history', 'future']);

export function validateCorpus(corpus, id = 'unknown') {
  const errors = [];
  if (!corpus || typeof corpus !== 'object' || Array.isArray(corpus)) return [`${id}: root must be a JSON object.`];
  if (typeof corpus.corpus !== 'string' || !corpus.corpus.trim()) errors.push(`${id}: corpus must be a non-empty string.`);
  if (typeof corpus.purpose !== 'string' || !corpus.purpose.trim()) errors.push(`${id}: purpose must be a non-empty string.`);
  if (corpus.experiments !== undefined) {
    if (!Array.isArray(corpus.experiments) || !corpus.experiments.length) {
      errors.push(`${id}: experiments must be a non-empty array when supplied.`);
    } else {
      for (const experiment of corpus.experiments) {
        if (!EXPERIMENTS.has(experiment)) errors.push(`${id}: unknown experiment "${experiment}".`);
      }
    }
  }
  if (!Array.isArray(corpus.events) || !corpus.events.length) {
    errors.push(`${id}: events must be a non-empty array.`);
    return errors;
  }

  const ids = new Set();
  corpus.events.forEach((event, index) => {
    const at = `${id}: events[${index}]`;
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      errors.push(`${at} must be an object.`);
      return;
    }
    if (typeof event.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.id)) {
      errors.push(`${at}.id must be unique lowercase kebab-case.`);
    } else if (ids.has(event.id)) {
      errors.push(`${at}.id duplicates "${event.id}".`);
    } else {
      ids.add(event.id);
    }
    if (!Number.isInteger(event.year)) errors.push(`${at}.year must be an integer.`);
    for (const field of ['display', 'label', 'description']) {
      if (typeof event[field] !== 'string' || !event[field].trim()) errors.push(`${at}.${field} must be a non-empty string.`);
    }
    if (!Array.isArray(event.tags) || event.tags.some(tag => typeof tag !== 'string' || !tag.trim())) {
      errors.push(`${at}.tags must be an array of non-empty strings.`);
    }
  });
  return errors;
}

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
        displayName: corpus.displayName || '',
        purpose: corpus.purpose || '',
        experiments: corpus.experiments || ['alternate-history', 'future'],
        eventCount: corpus.events.length,
        firstYear: Math.min(...years),
        lastYear: Math.max(...years)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function loadCorpus(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error(`Invalid history corpus id: ${id}`);
  const corpus = JSON.parse(readFileSync(join(HISTORY_DIR, `${id}.json`), 'utf8'));
  const errors = validateCorpus(corpus, id);
  if (errors.length) throw new Error(`Invalid history corpus:\n${errors.join('\n')}`);
  return corpus;
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
