import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WORLD_SCHEMA_VERSION } from './world-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORLD_DIR = join(__dirname, 'worlds');

export function makeWorldRecord(content, metadata) {
  const generatedAt = metadata.generatedAt || new Date().toISOString();
  const id = `alt-${metadata.corpusId}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  return {
    schema: WORLD_SCHEMA_VERSION,
    id,
    kind: 'alternate-present',
    domain: metadata.corpusId,
    createdAt: generatedAt,
    ...content,
    provenance: {
      historyCorpus: metadata.corpusId,
      historyCorpusHash: metadata.corpusHash,
      scenarioBrief: metadata.scenarioBrief,
      generatorModel: metadata.model,
      promptVersion: metadata.promptVersion,
      generatedAt,
      batchIndex: metadata.batchIndex,
      batchSize: metadata.batchSize,
      usage: metadata.usage
    }
  };
}

export function saveWorld(world) {
  mkdirSync(WORLD_DIR, { recursive: true });
  const path = join(WORLD_DIR, `${world.id}.json`);
  writeFileSync(path, JSON.stringify(world, null, 2), 'utf8');
  return path;
}

export function listWorlds() {
  if (!existsSync(WORLD_DIR)) return [];
  return readdirSync(WORLD_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      try { return JSON.parse(readFileSync(join(WORLD_DIR, file), 'utf8')); }
      catch { return null; }
    })
    .filter(world => world?.schema === WORLD_SCHEMA_VERSION)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function loadWorld(id) {
  return listWorlds().find(world => world.id === id) || null;
}

export function clearWorlds() {
  if (!existsSync(WORLD_DIR)) return 0;
  let removed = 0;
  for (const file of readdirSync(WORLD_DIR).filter(name => name.endsWith('.json'))) {
    try { unlinkSync(join(WORLD_DIR, file)); removed++; } catch {}
  }
  return removed;
}
