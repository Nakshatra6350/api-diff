import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { init, restore, isActive, defineSchema, clearRegistry } from '../src/index.js';
import type { ApiSchema } from '../src/index.js';
import { getSchema } from '../src/schema.js';

const userSchema: ApiSchema = {
  id:   { type: 'string' },
  name: { type: 'string' },
};

const validUser = { id: '1', name: 'Nakshatra' };
const driftedUser = { id: 1, name: 'Nakshatra' }; // id should be a string

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// installs a mock as globalThis.fetch — always call BEFORE init()
function mockFetch(makeResponse: () => Response) {
  const mock = vi.fn(async (..._args: Parameters<typeof fetch>) => makeResponse());
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

beforeEach(() => {
  restore();
  clearRegistry();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  restore();
  clearRegistry();
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

// ── fix 1: init() / restore() are safe to call repeatedly ─────

describe('init() and restore() called repeatedly', () => {

  it('init() twice does not double-wrap fetch', async () => {
    const mock = mockFetch(() => jsonResponse(driftedUser));
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);

    init({ mode: 'silent', onDrift });
    init({ mode: 'silent', onDrift });
    init({ mode: 'silent', onDrift });

    await fetch('/api/users');

    expect(mock).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledTimes(1);
  });

  it('restore() after several init() calls gives back the original fetch', () => {
    const mock = mockFetch(() => jsonResponse(validUser));

    init('silent');
    init('silent');
    expect(globalThis.fetch).not.toBe(mock);

    restore();
    expect(globalThis.fetch).toBe(mock);
  });

  it('isActive() is true after init() and false after restore()', () => {
    mockFetch(() => jsonResponse(validUser));
    expect(isActive()).toBe(false);

    init('silent');
    expect(isActive()).toBe(true);
    init('silent');
    expect(isActive()).toBe(true);

    restore();
    expect(isActive()).toBe(false);
    restore();
    expect(isActive()).toBe(false);

    init({ enabled: false });
    expect(isActive()).toBe(false);
  });

  it('restore() twice is a no-op the second time', () => {
    const mock = mockFetch(() => jsonResponse(validUser));

    init('silent');
    restore();
    restore();

    expect(globalThis.fetch).toBe(mock);
  });

  it('restore() without init() leaves fetch alone', () => {
    const mock = mockFetch(() => jsonResponse(validUser));

    restore();

    expect(globalThis.fetch).toBe(mock);
  });

  it('re-init applies the latest config', async () => {
    mockFetch(() => jsonResponse(driftedUser));
    const first = vi.fn();
    const second = vi.fn();
    defineSchema('/api/users', userSchema);

    init({ mode: 'silent', onDrift: first });
    init({ mode: 'throw', onDrift: second });

    await expect(fetch('/api/users')).rejects.toThrow('Contract drift on /api/users');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('init({ enabled: false }) after init() removes the interceptor', async () => {
    const mock = mockFetch(() => jsonResponse(driftedUser));
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);

    init({ mode: 'silent', onDrift });
    init({ mode: 'silent', onDrift, enabled: false });

    expect(globalThis.fetch).toBe(mock);
    await fetch('/api/users');
    expect(onDrift).not.toHaveBeenCalled();
  });

  it('init({ enabled: false }) does not clobber a fetch set after import', () => {
    const mock = mockFetch(() => jsonResponse(validUser));

    init({ enabled: false });

    expect(globalThis.fetch).toBe(mock);
  });

  it('init() picks up a fetch that was replaced since the last init()', async () => {
    const stale = mockFetch(() => jsonResponse(validUser));
    init('silent');

    const fresh = mockFetch(() => jsonResponse(validUser));
    init('silent');

    await fetch('/api/users');
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);

    restore();
    expect(globalThis.fetch).toBe(fresh);
  });

  it('a captured interceptor passes through after restore()', async () => {
    const mock = mockFetch(() => jsonResponse(driftedUser));
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);

    init({ mode: 'silent', onDrift });
    const captured = globalThis.fetch;
    restore();

    await captured('/api/users');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(onDrift).not.toHaveBeenCalled();
  });

});

// ── fix 2: response types and status codes ────────────────────

describe('response types and status codes', () => {

  async function driftsFor(response: Response) {
    mockFetch(() => response);
    const clone = vi.spyOn(response, 'clone');
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    init({ mode: 'silent', onDrift });

    const returned = await fetch('/api/users');

    expect(returned).toBe(response);
    return { onDrift, clone };
  }

  it('inspects application/json', async () => {
    const { onDrift } = await driftsFor(jsonResponse(driftedUser));
    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift.mock.calls[0][1][0].field).toBe('id');
  });

  it('strips charset params from Content-Type', async () => {
    const { onDrift } = await driftsFor(
      jsonResponse(driftedUser, {
        headers: { 'Content-Type': 'Application/JSON; charset=utf-8' },
      })
    );
    expect(onDrift).toHaveBeenCalledTimes(1);
  });

  it.each([
    'application/problem+json',
    'application/vnd.api+json',
    'application/vnd.api+json; charset=utf-8',
  ])('inspects +json media type %s', async contentType => {
    const { onDrift } = await driftsFor(
      jsonResponse(driftedUser, { headers: { 'Content-Type': contentType } })
    );
    expect(onDrift).toHaveBeenCalledTimes(1);
  });

  it.each(['text/html', 'text/plain', 'text/plain; charset=utf-8'])(
    'skips %s without touching the body',
    async contentType => {
      const { onDrift, clone } = await driftsFor(
        new Response(JSON.stringify(driftedUser), {
          headers: { 'Content-Type': contentType },
        })
      );
      expect(onDrift).not.toHaveBeenCalled();
      expect(clone).not.toHaveBeenCalled();
    }
  );

  it('does not throw on a non-JSON response in throw mode', async () => {
    mockFetch(() => new Response('<h1>hello</h1>', { headers: { 'Content-Type': 'text/html' } }));
    defineSchema('/api/users', userSchema);
    init('throw');

    await expect(fetch('/api/users')).resolves.toBeInstanceOf(Response);
  });

  it('throws on a drifted JSON response in throw mode', async () => {
    mockFetch(() => jsonResponse(driftedUser));
    defineSchema('/api/users', userSchema);
    init('throw');

    await expect(fetch('/api/users')).rejects.toThrow('Contract drift');
  });

  it('skips responses with no Content-Type', async () => {
    const response = new Response(JSON.stringify(driftedUser));
    response.headers.delete('Content-Type');

    const { onDrift, clone } = await driftsFor(response);
    expect(onDrift).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });

  it('does not treat a type that merely contains "json" as JSON', async () => {
    const { onDrift } = await driftsFor(
      new Response(JSON.stringify(driftedUser), {
        headers: { 'Content-Type': 'application/jsonp' },
      })
    );
    expect(onDrift).not.toHaveBeenCalled();
  });

  it.each([204, 304])('skips %i responses entirely', async status => {
    const { onDrift, clone } = await driftsFor(
      new Response(null, {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(onDrift).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
  });

  it.each([400, 404, 500, 503])('still inspects %i responses when they are JSON', async status => {
    const { onDrift } = await driftsFor(
      jsonResponse({ error: 'something went wrong' }, { status })
    );
    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift.mock.calls[0][1].map((d: { field: string }) => d.field)).toEqual(['id', 'name']);
  });

  it('skips 4xx/5xx responses that are not JSON', async () => {
    const { onDrift } = await driftsFor(
      new Response('<h1>Bad Gateway</h1>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })
    );
    expect(onDrift).not.toHaveBeenCalled();
  });

  it('does not throw on a JSON content type with an invalid body', async () => {
    const { onDrift } = await driftsFor(
      new Response('not json {', {
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(onDrift).not.toHaveBeenCalled();
  });

  it('leaves the original response body readable', async () => {
    mockFetch(() => jsonResponse(validUser));
    defineSchema('/api/users', userSchema);
    init('throw');

    const response = await fetch('/api/users');

    expect(await response.json()).toEqual(validUser);
  });

});

// ── fix 3: URL matching for real fetch inputs ─────────────────

describe('URL matching', () => {

  it('matches a path schema against a full URL', () => {
    defineSchema('/api/users', userSchema);
    expect(getSchema('https://api.example.com/api/users')).toBe(userSchema);
  });

  it('ignores query string and hash on full URLs', () => {
    defineSchema('/api/users', userSchema);
    expect(getSchema('https://api.example.com/api/users?page=2&limit=10')).toBe(userSchema);
    expect(getSchema('https://api.example.com:8443/api/users#top')).toBe(userSchema);
  });

  it('still matches relative paths, with or without a query string', () => {
    defineSchema('/api/users', userSchema);
    expect(getSchema('/api/users')).toBe(userSchema);
    expect(getSchema('/api/users?page=2')).toBe(userSchema);
    expect(getSchema('/api/users#top')).toBe(userSchema);
  });

  it('does not match a full URL whose path only ends with the pattern', () => {
    defineSchema('/api/users', userSchema);
    expect(getSchema('https://api.example.com/v2/api/users')).toBeUndefined();
    expect(getSchema('https://api.example.com/api/users/123')).toBeUndefined();
  });

  it('matches :param and * patterns against full URLs', () => {
    const postSchema: ApiSchema = { title: { type: 'string' } };
    defineSchema('/api/users/:id', userSchema);
    defineSchema('/api/posts/*', postSchema);

    expect(getSchema('https://api.example.com/api/users/123?include=posts')).toBe(userSchema);
    expect(getSchema('https://api.example.com/api/users')).toBeUndefined();
    expect(getSchema('https://api.example.com/api/users/123/posts')).toBeUndefined();

    expect(getSchema('https://api.example.com/api/posts/abc-456')).toBe(postSchema);
    expect(getSchema('/api/posts/abc-456')).toBe(postSchema);
    expect(getSchema('/api/posts')).toBeUndefined();
  });

  it('still matches schemas registered as full URLs', () => {
    defineSchema('https://api.example.com/api/users', userSchema);
    expect(getSchema('https://api.example.com/api/users?page=2')).toBe(userSchema);
    expect(getSchema('https://other.example.com/api/users')).toBeUndefined();
  });

  it.each([
    ['a string', 'https://api.example.com/api/users?page=2'],
    ['a URL object', new URL('https://api.example.com/api/users?page=2')],
    ['a Request object', new Request('https://api.example.com/api/users?page=2')],
  ])('interceptor matches when fetch receives %s', async (_label, input) => {
    mockFetch(() => jsonResponse(driftedUser));
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    init({ mode: 'silent', onDrift });

    await fetch(input);

    expect(onDrift).toHaveBeenCalledTimes(1);
    expect(onDrift.mock.calls[0][0]).toBe('https://api.example.com/api/users?page=2');
  });

});

// ── fix 4: large responses ────────────────────────────────────

describe('large responses', () => {

  const ONE_MB = 1024 * 1024;

  function sized(contentLength: string | null): Response {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (contentLength !== null) headers['Content-Length'] = contentLength;
    return new Response(JSON.stringify(driftedUser), { headers });
  }

  async function run(response: Response, mode: 'warn' | 'throw' | 'silent' = 'warn') {
    mockFetch(() => response);
    const clone = vi.spyOn(response, 'clone');
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    init({ mode, onDrift });

    const returned = await fetch('/api/users');

    expect(returned).toBe(response);
    return { onDrift, clone };
  }

  it('skips inspection and warns when Content-Length exceeds 1MB', async () => {
    const { onDrift, clone } = await run(sized(String(ONE_MB + 1)));

    expect(clone).not.toHaveBeenCalled();
    expect(onDrift).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipped large response on /api/users')
    );
  });

  it('does not throw for a large response in throw mode', async () => {
    const { onDrift, clone } = await run(sized(String(5 * ONE_MB)), 'throw');

    expect(clone).not.toHaveBeenCalled();
    expect(onDrift).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('stays quiet about a large response in silent mode', async () => {
    const { onDrift, clone } = await run(sized(String(5 * ONE_MB)), 'silent');

    expect(clone).not.toHaveBeenCalled();
    expect(onDrift).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['exactly 1MB', String(ONE_MB)],
    ['512 bytes', '512'],
  ])('inspects a response of %s', async (_label, contentLength) => {
    const { onDrift, clone } = await run(sized(contentLength), 'silent');

    expect(clone).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledTimes(1);
  });

  it('treats a missing Content-Length as safe', async () => {
    const { onDrift, clone } = await run(sized(null), 'silent');

    expect(clone).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledTimes(1);
  });

  it('treats a non-numeric Content-Length as safe', async () => {
    const { onDrift, clone } = await run(sized('not-a-number'), 'silent');

    expect(clone).toHaveBeenCalledTimes(1);
    expect(onDrift).toHaveBeenCalledTimes(1);
  });

  it('returns the response untouched when clone() throws', async () => {
    const response = sized(null);
    mockFetch(() => response);
    vi.spyOn(response, 'clone').mockImplementation(() => {
      throw new TypeError('Response body is already used');
    });
    const onDrift = vi.fn();
    defineSchema('/api/users', userSchema);
    init({ mode: 'throw', onDrift });

    await expect(fetch('/api/users')).resolves.toBe(response);
    expect(onDrift).not.toHaveBeenCalled();
  });

});
