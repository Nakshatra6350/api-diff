import { getSchema } from './schema.js';
import { diffResponse } from './diff.js';
import { severityLabel } from './severity.js';
import type { DiffMode, DriftItem } from './types.js';

export interface AxiosAdapterConfig {
  mode?: DiffMode;
  strict?: boolean;
  ignore?: string[];
  maxResponseTime?: number;
  enabled?: boolean;
  onDrift?: (url: string, drifts: DriftItem[]) => void;
}

export function createAxiosAdapter<T extends AxiosLike>(
  axiosInstance: T,
  config: AxiosAdapterConfig = {}
): T {
  const {
    mode = 'warn',
    strict = false,
    ignore = [],
    maxResponseTime,
    enabled = true,
    onDrift,
  } = config;

  if (!enabled) return axiosInstance;

  // request interceptor — stamp start time onto config
  axiosInstance.interceptors.request.use((cfg: any) => {
    cfg.__apiDiffStart = performance.now();
    return cfg;
  });

  // response interceptor — check drift
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      const url = extractUrl(response);
      const responseTime = extractResponseTime(response);
      const schema = getSchema(url);

      if (!schema) return response;

      const data = response.data;
      if (typeof data !== 'object' || data === null) return response;

      const result = diffResponse(data, schema, '', strict, ignore);
      const isSlowBreach =
        maxResponseTime !== undefined && responseTime > maxResponseTime;

      if (!result.passed || isSlowBreach) {
        const driftsWithTime = result.drifts.map(d => ({ ...d, responseTime }));

        if (onDrift) onDrift(url, driftsWithTime);

        const parts: string[] = [];

        if (isSlowBreach) {
          parts.push(
            `[api-diff] Slow response on ${url} — ${responseTime}ms exceeded maxResponseTime of ${maxResponseTime}ms`
          );
        }

        if (!result.passed) {
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
        if (mode === 'warn') console.warn(msg);
        else if (mode === 'throw') throw new Error(msg);
      }

      return response;
    },
    (error: unknown) => Promise.reject(error)
  );

  return axiosInstance;
}

function extractUrl(response: AxiosResponse): string {
  const config = response.config ?? {};
  const base = (config.baseURL ?? '').replace(/\/+$/, '');
  const path = config.url ?? '';
  if (path.startsWith('http')) return path;
  if (!base) return path;
  // join the way Axios does — exactly one slash between baseURL and url
  return path ? `${base}/${path.replace(/^\/+/, '')}` : base;
}

function extractResponseTime(response: AxiosResponse): number {
  const start = (response.config as any)?.__apiDiffStart;
  return start ? Math.round(performance.now() - start) : 0;
}

// minimal Axios type surface — avoids requiring @types/axios as a dependency
interface AxiosResponse {
  data: unknown;
  config: Record<string, any>;
}

interface AxiosLike {
  interceptors: {
    request: {
      use(onFulfilled: (config: any) => any): number;
    };
    response: {
      // `any` here so a real Axios instance (whose response type carries
      // status, headers, etc.) is assignable — the handler itself only
      // relies on the AxiosResponse fields above
      use(
        onFulfilled: (response: any) => any,
        onRejected: (error: unknown) => Promise<never>
      ): number;
    };
  };
}
