import type { ApiSchema } from './types.js';

interface SchemaEntry {
  pattern: string;
  regex: RegExp;
  schema: ApiSchema;
}

const registry: SchemaEntry[] = [];

function patternToRegex(pattern: string): RegExp {
  const safe = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '[^/]+')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '[^/]+');

  return new RegExp(`^${safe}($|\\?)`);
}

export function defineSchema(pattern: string, schema: ApiSchema): void {
  registry.push({
    pattern,
    regex: patternToRegex(pattern),
    schema,
  });
}

export function getSchema(url: string): ApiSchema | undefined {
  const cleanUrl = url.split('?')[0];
  for (const entry of registry) {
    if (entry.regex.test(cleanUrl)) {
      return entry.schema;
    }
  }
  return undefined;
}

export function clearRegistry(): void {
  registry.length = 0;
}