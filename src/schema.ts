import type { ApiSchema } from './types.js';

interface SchemaEntry {
  pattern: string;
  regex: RegExp;
  schema: ApiSchema;
}

const registry: SchemaEntry[] = [];

function patternToRegex(pattern: string): RegExp {
  // Escape special regex chars except * and :param
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/\*/g, '[^/]+')                // * matches one segment
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '[^/]+'); // :id matches one segment

  return new RegExp(`${escaped}($|\\?)`);
}

export function defineSchema(pattern: string, schema: ApiSchema): void {
  registry.push({
    pattern,
    regex: patternToRegex(pattern),
    schema,
  });
}

export function getSchema(url: string): ApiSchema | undefined {
  // strip query string for matching
  const cleanUrl = url.split('?')[0];

  for (const entry of registry) {
    if (entry.regex.test(cleanUrl)) {
      return entry.schema;
    }
  }
  return undefined;
}