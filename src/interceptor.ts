import { getSchema } from './schema.js';
import { diffResponse } from './diff.js';
import type { DiffMode } from './types.js';

let _mode: DiffMode = 'warn';
let _originalFetch = globalThis.fetch;

export function init(mode: DiffMode = 'warn') {
  _mode = mode;
  _originalFetch = globalThis.fetch;

  globalThis.fetch = async function (...args: Parameters<typeof fetch>) {
    const response = await _originalFetch(...args);
    const url = typeof args[0] === 'string'
                ? args[0]
                : args[0] instanceof URL
                    ? args[0].href
                    : args[0].url;
    const schema = getSchema(url);

    if (schema) {
      const clone = response.clone();
      const data = await clone.json().catch(() => null);
      if (data !== null) {
        const result = diffResponse(data, schema);
        if (!result.passed) {
          const msg = `[api-diff] Contract drift on ${url}:\n` +
            result.drifts.map(d => `  • ${d.field}: expected ${d.expected}, got ${d.received}`).join('\n');
          if (_mode === 'warn') console.warn(msg);
          else if (_mode === 'throw') throw new Error(msg);
        }
      }
    }

    return response;
  };
}

export function restore() {
  globalThis.fetch = _originalFetch;
}