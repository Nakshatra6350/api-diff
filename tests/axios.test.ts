import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAxiosAdapter } from '../src/axios.js';
import { defineSchema, clearRegistry } from '../src/index.js';
import type { ApiSchema } from '../src/index.js';

const userSchema: ApiSchema = {
  id:   { type: 'string' },
  name: { type: 'string' },
};

const validUser = { id: '1', name: 'Nakshatra' };

// real Axios is a peer dependency only — mock the interceptors interface directly
function makeAxiosMock(responseData: unknown, status = 200) {
  const requestHandlers: ((cfg: any) => any)[] = [];
  const responseHandlers: ((res: any) => any)[] = [];

  const instance = {
    requestHandlers,
    responseHandlers,
    interceptors: {
      request: {
        use: (fn: (cfg: any) => any) => { requestHandlers.push(fn); return 0; }
      },
      response: {
        use: (onFulfilled: (res: any) => any, _onRejected: any) => {
          responseHandlers.push(onFulfilled);
          return 0;
        }
      }
    },
    // simulate a request
    async request(cfg: any) {
      let config = { ...cfg };
      for (const h of requestHandlers) config = h(config);
      const response = { data: responseData, config, status };
      let result = response;
      for (const h of responseHandlers) result = h(result);
      return result;
    }
  };

  return instance;
}

beforeEach(() => {
  clearRegistry();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  clearRegistry();
  vi.restoreAllMocks();
});

describe('createAxiosAdapter', () => {

  it('returns the same instance it was given', () => {
    const axios = makeAxiosMock(validUser);
    expect(createAxiosAdapter(axios, { mode: 'throw' })).toBe(axios);
  });

  it('clean response — no error thrown', async () => {
    const axios = makeAxiosMock(validUser);
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw' });

    const response = await axios.request({ url: '/api/users' });

    expect(response.data).toEqual(validUser);
  });

  it('drifted response in throw mode — throws Contract drift', async () => {
    const axios = makeAxiosMock({ id: '1' });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw' });

    await expect(axios.request({ url: '/api/users' })).rejects.toThrow('Contract drift');
  });

  it('wrong type — throws with the field name and severity in the message', async () => {
    const axios = makeAxiosMock({ id: 1, name: 'Nakshatra' });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw' });

    await expect(axios.request({ url: '/api/users' })).rejects.toThrow(
      /BREAKING\s+id: expected string, got number/
    );
  });

  it('enabled: false — no interceptors installed', async () => {
    const axios = makeAxiosMock({ id: 1 });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw', enabled: false });

    expect(axios.requestHandlers.length).toBe(0);
    expect(axios.responseHandlers.length).toBe(0);
    await expect(axios.request({ url: '/api/users' })).resolves.toBeDefined();
  });

  it('onDrift callback fires with url and drifts', async () => {
    const axios = makeAxiosMock({ id: 1, name: 'Nakshatra' });
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'silent', onDrift });

    await axios.request({ url: '/api/users' });

    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledWith('/api/users', [
      expect.objectContaining({ field: 'id', expected: 'string', received: 'number' }),
    ]);
  });

  it('drifts include driftSeverity and responseTime', async () => {
    const axios = makeAxiosMock({ id: null, extra: true });
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'silent', strict: true, onDrift });

    await axios.request({ url: '/api/users' });

    const drifts = onDrift.mock.calls[0][1];
    expect(drifts.map((d: any) => [d.field, d.driftSeverity])).toEqual([
      ['id', 'warning'],
      ['name', 'breaking'],
      ['extra', 'info'],
    ]);
    for (const d of drifts) expect(typeof d.responseTime).toBe('number');
  });

  it('slow response triggers the maxResponseTime warning', async () => {
    const axios = makeAxiosMock(validUser);
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'warn', maxResponseTime: 2000, onDrift });

    // request stamped at 1000ms, response handled at 4000ms → 3000ms
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(4000);
    await axios.request({ url: '/api/users' });

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      '[api-diff] Slow response on /api/users — 3000ms exceeded maxResponseTime of 2000ms'
    );
    expect(onDrift).toHaveBeenCalledWith('/api/users', []);
  });

  it('fast clean response does not warn', async () => {
    const axios = makeAxiosMock(validUser);
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'warn', maxResponseTime: 2000 });

    await axios.request({ url: '/api/users' });

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warn mode logs drift without throwing', async () => {
    const axios = makeAxiosMock({ id: '1' });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'warn' });

    await expect(axios.request({ url: '/api/users' })).resolves.toBeDefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Contract drift on /api/users')
    );
  });

  it('ignores URLs with no registered schema', async () => {
    const axios = makeAxiosMock({ anything: true });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw' });

    await expect(axios.request({ url: '/api/products' })).resolves.toBeDefined();
  });

  it('skips non-object response data', async () => {
    const axios = makeAxiosMock('<html></html>');
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw' });

    await expect(axios.request({ url: '/api/users' })).resolves.toBeDefined();
  });

  it('honours the ignore list in strict mode', async () => {
    const axios = makeAxiosMock({ ...validUser, __v: 0 });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw', strict: true, ignore: ['__v'] });

    await expect(axios.request({ url: '/api/users' })).resolves.toBeDefined();
  });

  it.each([
    ['baseURL + path',                 { baseURL: 'https://api.example.com', url: '/api/users' }],
    ['baseURL with trailing slash',    { baseURL: 'https://api.example.com/', url: '/api/users' }],
    ['path without a leading slash',   { baseURL: 'https://api.example.com/api', url: 'users' }],
    ['relative baseURL',               { baseURL: '/api', url: '/users' }],
    ['absolute url ignoring baseURL',  { baseURL: 'https://other.example.com/v2', url: 'https://api.example.com/api/users?page=2' }],
  ])('matches the schema with %s', async (_label, requestConfig) => {
    const axios = makeAxiosMock({ id: 1, name: 'Nakshatra' });
    defineSchema('/api/users', userSchema);
    createAxiosAdapter(axios, { mode: 'throw' });

    await expect(axios.request(requestConfig)).rejects.toThrow('Contract drift');
  });

});
