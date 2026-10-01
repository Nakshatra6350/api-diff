import { classifySeverity } from './severity.js';
import type { ApiSchema, DriftItem, DiffResult } from './types.js';

function shouldIgnore(fullKey: string, ignore: string[]): boolean {
  for (const pattern of ignore) {
    // 1. exact full path match — 'user.createdOnDate' or 'users[0].createdOnDate'
    if (pattern === fullKey) return true;

    // 2. bare field name — 'updatedAt' matches anywhere regardless of depth
    if (!pattern.includes('.') && !pattern.includes('[')) {
      // extract the trailing field name from fullKey, stripping array indexes
      const fieldName = fullKey
        .split('.')
        .pop()
        ?.replace(/\[\d+\].*/, '') ?? '';
      if (pattern === fieldName) return true;
    }

    // 3. root-level prefix — 'root.createdOnDate' matches only top-level key
    if (pattern.startsWith('root.')) {
      const rootField = pattern.slice('root.'.length);
      if (!fullKey.includes('.') && !fullKey.includes('[') && fullKey === rootField) {
        return true;
      }
    }

    // 4. wildcard array pattern — 'users[*].createdOnDate'
    if (pattern.includes('[*]')) {
      const safe = pattern
        .replace(/\./g, '\\.')
        .replace(/\[\*\]/g, '\\[\\d+\\]');
      const regex = new RegExp(`^${safe}$`);
      if (regex.test(fullKey)) return true;
    }
  }
  return false;
}

export function diffResponse(
  data: unknown,
  schema: ApiSchema,
  prefix = '',
  strict = false,
  ignore: string[] = []
): DiffResult {
  const drifts: DriftItem[] = [];

  if (typeof data !== 'object' || data === null) {
    const raw = {
      field: prefix || 'root',
      expected: 'object',
      received: typeof data,
      severity: 'type_mismatch' as const,
    };
    return {
      passed: false,
      drifts: [{ ...raw, driftSeverity: classifySeverity(raw) }],
    };
  }

  const obj = data as Record<string, unknown>;

  // --- check schema fields against actual response ---
  for (const [key, def] of Object.entries(schema)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (!(key in obj)) {
      if (def.required !== false) {
        const raw = {
          field: fullKey,
          expected: def.type,
          received: 'missing',
          severity: 'missing' as const,
        };
        drifts.push({ ...raw, driftSeverity: classifySeverity(raw) });
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
      const raw = {
        field: fullKey,
        expected: def.type,
        received: actualType,
        severity: 'type_mismatch' as const,
      };
      drifts.push({ ...raw, driftSeverity: classifySeverity(raw) });
      continue;
    }

    // recurse into nested objects
    if (
      def.type === 'object' &&
      def.fields &&
      typeof val === 'object' &&
      val !== null
    ) {
      const nested = diffResponse(val, def.fields, fullKey, strict, ignore);
      drifts.push(...nested.drifts);
    }

    // validate every item in arrays
    if (def.type === 'array' && def.items && Array.isArray(val)) {
      val.forEach((item, index) => {
        const itemPrefix = `${fullKey}[${index}]`;
        const itemResult = diffResponse(item, def.items!, itemPrefix, strict, ignore);
        drifts.push(...itemResult.drifts);
      });
    }
  }

  // --- strict mode: flag unexpected fields not in schema ---
  if (strict) {
    const schemaKeys = new Set(Object.keys(schema));
    for (const key of Object.keys(obj)) {
      if (!schemaKeys.has(key)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (!shouldIgnore(fullKey, ignore)) {
          const raw = {
            field: fullKey,
            expected: 'not in schema',
            received: typeof obj[key],
            severity: 'unexpected' as const,
          };
          drifts.push({ ...raw, driftSeverity: classifySeverity(raw) });
        }
      }
    }
  }

  return { passed: drifts.length === 0, drifts };
}