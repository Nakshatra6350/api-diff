import { getSchema } from './schema.js';
import { diffResponse } from './diff.js';
import type { DiffMode, InitConfig } from './types.js';

let _mode: DiffMode = 'warn';
let _onDrift: ((url: string, drifts: any[]) => void) | undefined;
let _strict = false;
let _ignore: string[] = [];
let _maxResponseTime: number | undefined;
let _enabled = true;
let _originalFetch = globalThis.fetch;

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

  // if disabled, restore original fetch and do nothing
  if (!_enabled) {
    globalThis.fetch = _originalFetch;
    return;
  }

  _originalFetch = globalThis.fetch;

  globalThis.fetch = async function (...args: Parameters<typeof fetch>) {
    const start = performance.now();
    const response = await _originalFetch(...args);
    const responseTime = Math.round(performance.now() - start);

    const url =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof URL
          ? args[0].href
          : args[0].url;

    const schema = getSchema(url);

    if (schema) {
      const clone = response.clone();
      const data = await clone.json().catch(() => {
        // non-JSON response — skip silently, debug log in warn mode
        if (_mode === 'warn') {
          console.debug(`[api-diff] Skipped non-JSON response on ${url}`);
        }
        return null;
      });

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
              .map(d => `  • ${d.field}: expected ${d.expected}, got ${d.received}`)
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
    }

    return response;
  };
}

export function restore(): void {
  globalThis.fetch = _originalFetch;
}