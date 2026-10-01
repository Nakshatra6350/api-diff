import type { ApiSchema } from './types.js';

interface SchemaEntry {
  pattern: string;
  regex: RegExp;
  schema: ApiSchema;
}

const registry: SchemaEntry[] = [];

function patternToRegex(pattern: string): RegExp {
  const safe = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

// strings to test against each registered pattern
function normalizeUrl(url: string): string[] {
  try {
    // full URL — 'https://api.example.com/api/users?x=1' → '/api/users'
    const parsed = new URL(url);
    // also keep origin + path so schemas registered as full URLs still match
    return [parsed.pathname, `${parsed.origin}${parsed.pathname}`];
  } catch {
    // relative path — strip query string and hash
    return [url.split(/[?#]/)[0]];
  }
}

export function getSchema(url: string): ApiSchema | undefined {
  const candidates = normalizeUrl(url);
  for (const entry of registry) {
    if (candidates.some(candidate => entry.regex.test(candidate))) {
      return entry.schema;
    }
  }
  return undefined;
}

export function clearRegistry(): void {
  registry.length = 0;
}