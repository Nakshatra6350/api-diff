import { getSchema } from './schema.js';
import { diffResponse } from './diff.js';
import { severityLabel } from './severity.js';
import type { DiffMode, InitConfig } from './types.js';

// tags our interceptor and points at the fetch it wraps.
// Symbol.for so the CJS and ESM builds recognise each other's interceptor.
const INTERCEPTOR_TAG = Symbol.for('api-diff.interceptor');

type TaggedFetch = typeof fetch & { [INTERCEPTOR_TAG]?: typeof fetch };

// responses larger than this are not cloned — cloning buffers the whole body
const MAX_INSPECT_BYTES = 1024 * 1024; // 1MB

let _mode: DiffMode = 'warn';
let _onDrift: ((url: string, drifts: any[]) => void) | undefined;
let _strict = false;
let _ignore: string[] = [];
let _maxResponseTime: number | undefined;
let _enabled = true;
let _active: typeof fetch | undefined;

// peel every api-diff interceptor off globalThis.fetch
function unwrap(): void {
  let current = globalThis.fetch as TaggedFetch | undefined;
  while (current?.[INTERCEPTOR_TAG]) {
    current = current[INTERCEPTOR_TAG];
  }
  if (current && current !== globalThis.fetch) {
    globalThis.fetch = current;
  }
  _active = undefined;
}

function isJson(response: Response): boolean {
  // 'application/json; charset=utf-8' → 'application/json'
  const contentType = (response.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return contentType === 'application/json' || contentType.endsWith('+json');
}

export function init(config: DiffMode | InitConfig = 'warn'): void {
  if (typeof config === 'string') {
    _mode = config;
    _onDrift = undefined;
    _strict = false;
    _ignore = [];
    _maxResponseTime = undefined;
    _enabled = true;
  } else {
    _mode = config.mode ?? 'warn';
    _onDrift = config.onDrift;
    _strict = config.strict ?? false;
    _ignore = config.ignore ?? [];
    _maxResponseTime = config.maxResponseTime;
    _enabled = config.enabled ?? true;
  }

  // remove any interceptor from a previous init() so we never wrap ourselves
  unwrap();

  // if disabled, leave fetch untouched
  if (!_enabled) return;

  const originalFetch = globalThis.fetch;

  const interceptor: TaggedFetch = async function (...args: Parameters<typeof fetch>) {
    // restored, but something else still holds a reference to us — pass through
    if (_active !== interceptor) return originalFetch(...args);

    const start = performance.now();
    const response = await originalFetch(...args);
    const responseTime = Math.round(performance.now() - start);

    const url =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof URL
          ? args[0].href
          : args[0].url;

    const schema = getSchema(url);
    if (!schema) return response;

    // 204 / 304 never carry a body — nothing to inspect
    if (response.status === 204 || response.status === 304) return response;

    if (!isJson(response)) {
      // non-JSON response — skip silently, debug log in warn mode
      if (_mode === 'warn') {
        console.debug(`[api-diff] Skipped non-JSON response on ${url}`);
      }
      return response;
    }

    // missing (→ 0) or unparseable (→ NaN) Content-Length is treated as safe
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_INSPECT_BYTES) {
      if (_mode !== 'silent') {
        console.warn(
          `[api-diff] Skipped large response on ${url} — ${contentLength} bytes exceeds inspection limit of ${MAX_INSPECT_BYTES} bytes`
        );
      }
      return response;
    }

    let data: unknown = null;
    try {
      data = await response.clone().json();
    } catch {
      // body could not be read or is not valid JSON — skip
      if (_mode === 'warn') {
        console.debug(`[api-diff] Skipped unparseable JSON response on ${url}`);
      }
    }

    if (data !== null) {
      const result = diffResponse(data, schema, '', _strict, _ignore);

      // check response time breach even if schema passed
      const isSlowBreach =
        _maxResponseTime !== undefined && responseTime > _maxResponseTime;

      const hasDrift = !result.passed;

      if (hasDrift || isSlowBreach) {
        // attach responseTime to every drift item as raw number
        const driftsWithTime = result.drifts.map(d => ({
          ...d,
          responseTime,  // raw number in ms — no unit appended
        }));

        // fire onDrift callback
        if (_onDrift) {
          _onDrift(url, driftsWithTime);
        }

        // build console message
        const parts: string[] = [];

        if (isSlowBreach) {
          parts.push(
            `[api-diff] Slow response on ${url} — ${responseTime}ms exceeded maxResponseTime of ${_maxResponseTime}ms`
          );
        }

        if (hasDrift) {
          const driftLines = driftsWithTime
            .map(d =>
              `  ${severityLabel(d.driftSeverity)}  ${d.field}: expected ${d.expected}, got ${d.received}`
            )
            .join('\n');
          parts.push(
            `[api-diff] Contract drift on ${url} (${responseTime}ms):\n${driftLines}`
          );
        }

        const msg = parts.join('\n');

        if (_mode === 'warn') console.warn(msg);
        else if (_mode === 'throw') throw new Error(msg);
      }
    }

    return response;
  };

  interceptor[INTERCEPTOR_TAG] = originalFetch;
  _active = interceptor;
  globalThis.fetch = interceptor;
}

export function restore(): void {
  unwrap();
}

export function isActive(): boolean {
  return _active !== undefined;
}
