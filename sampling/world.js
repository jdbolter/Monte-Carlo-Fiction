import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WORLD_SCHEMA_VERSION } from './world-schema.js';
import { FUTURE_WORLD_SCHEMA_VERSION } from './future-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WORLD_DIR = join(__dirname, 'worlds');
export const SUPPORTED_WORLD_SCHEMAS = new Set([WORLD_SCHEMA_VERSION, FUTURE_WORLD_SCHEMA_VERSION]);

export function makeWorldRecord(content, metadata) {
  const generatedAt = metadata.generatedAt || new Date().toISOString();
  const kind = metadata.kind || 'alternate-present';
  const schema = metadata.schema || WORLD_SCHEMA_VERSION;
  const prefix = kind === 'future' ? 'future' : 'alt';
  const id = `${prefix}-${metadata.corpusId}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  return {
    schema,
    id,
    kind,
    domain: metadata.corpusId,
    createdAt: generatedAt,
    ...content,
    validation: {
      status: metadata.validationWarnings?.length ? 'warnings' : 'valid',
      warnings: metadata.validationWarnings || [],
      diagnosticFile: metadata.validationDiagnostic || null
    },
    provenance: {
      historyCorpus: metadata.corpusId,
      historyCorpusHash: metadata.corpusHash,
      scenarioBrief: metadata.scenarioBrief,
      generationInput: metadata.generationInput || null,
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
    .filter(world => SUPPORTED_WORLD_SCHEMAS.has(world?.schema))
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
