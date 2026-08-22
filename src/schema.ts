import type { ApiSchema } from './types.js';

const registry = new Map<string, ApiSchema>();

export function defineSchema(url: string, schema: ApiSchema): void {
  registry.set(url, schema);
}

export function getSchema(url: string): ApiSchema | undefined {
  // match by exact URL or pattern
  for (const [pattern, schema] of registry.entries()) {
    if (url.includes(pattern) || url === pattern) return schema;
  }
  return undefined;
}