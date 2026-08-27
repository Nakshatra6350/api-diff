import type { ApiSchema, DriftItem, DiffResult } from './types.js';

export function diffResponse(
  data: unknown,
  schema: ApiSchema,
  prefix = '',
  strict = false
): DiffResult {
  const drifts: DriftItem[] = [];

  if (typeof data !== 'object' || data === null) {
    return {
      passed: false,
      drifts: [{
        field: prefix || 'root',
        expected: 'object',
        received: typeof data,
        severity: 'type_mismatch'
      }]
    };
  }

  const obj = data as Record<string, unknown>;

  // Check schema fields against actual response
  for (const [key, def] of Object.entries(schema)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (!(key in obj)) {
      if (def.required !== false) {
        drifts.push({
          field: fullKey,
          expected: def.type,
          received: 'missing',
          severity: 'missing'
        });
      }
      continue;
    }

    const val = obj[key];
    const actualType = Array.isArray(val)
      ? 'array'
      : val === null
        ? 'null'
        : typeof val;

    if (actualType !== def.type) {
      drifts.push({
        field: fullKey,
        expected: def.type,
        received: actualType,
        severity: 'type_mismatch'
      });
      continue;
    }

    // Recurse into nested objects
    if (def.type === 'object' && def.fields && typeof val === 'object' && val !== null) {
      const nested = diffResponse(val, def.fields, fullKey, strict);
      drifts.push(...nested.drifts);
    }

    // Validate array items
    if (def.type === 'array' && def.items && Array.isArray(val)) {
      val.forEach((item, index) => {
        const itemPrefix = `${fullKey}[${index}]`;
        const itemResult = diffResponse(item, def.items!, itemPrefix, strict);
        drifts.push(...itemResult.drifts);
      });
    }
  }

  // NEW — strict mode: flag fields in response not present in schema
  if (strict) {
    const schemaKeys = new Set(Object.keys(schema));
    for (const key of Object.keys(obj)) {
      if (!schemaKeys.has(key)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        drifts.push({
          field: fullKey,
          expected: 'not in schema',
          received: typeof obj[key],
          severity: 'unexpected'
        });
      }
    }
  }

  return { passed: drifts.length === 0, drifts };
}