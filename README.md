# @nakshatra6350/api-diff

[![npm version](https://img.shields.io/npm/v/@nakshatra6350/api-diff)](https://www.npmjs.com/package/@nakshatra6350/api-diff)
[![npm downloads](https://img.shields.io/npm/dw/@nakshatra6350/api-diff)](https://www.npmjs.com/package/@nakshatra6350/api-diff)
[![license](https://img.shields.io/npm/l/@nakshatra6350/api-diff)](https://github.com/nakshatra6350/api-diff/blob/main/LICENSE)
[![CI](https://github.com/nakshatra6350/api-diff/actions/workflows/ci.yml/badge.svg)](https://github.com/nakshatra6350/api-diff/actions)

> Catch API contract drift before your users do.

## The problem

Your backend changes a response shape. Your frontend breaks silently. TypeScript types go stale. Nobody notices until production — when users start seeing blank screens, broken tables, or silent failures.

`api-diff` intercepts every `fetch` call at runtime and compares the actual response against a schema you define once. When the shape drifts, it tells you immediately — in dev, in tests, or silently in production while you collect the data.

---

## Install

```bash
npm install @nakshatra6350/api-diff
```

---

## Quick start

```ts
import { init, defineSchema } from '@nakshatra6350/api-diff';

// Step 1 — define what you expect from each endpoint
defineSchema('/api/users', {
  id:    { type: 'string' },
  name:  { type: 'string' },
  email: { type: 'string' },
  role:  { type: 'string', required: false },
});

// Step 2 — start intercepting all fetch calls
init('warn');

// That's it. Every fetch to /api/users is now contract-checked.
```

When your API returns a shape that doesn't match, you'll see this in the console:

```
[api-diff] Contract drift on /api/users:
  • email: expected string, got missing
  • id: expected string, got number
```

---

## Modes

| Mode | Behaviour | Best used in |
|------|-----------|--------------|
| `warn` | `console.warn` on every drift | Development |
| `throw` | Throws an `Error` on first drift | Tests / CI |
| `silent` | No output — drift is ignored | Production (observe only) |

```ts
init('warn');    // development
init('throw');   // tests
init('silent');  // production
```

---

## Wildcard URL matching

Define one schema that covers all dynamic route segments — no need to register every individual ID.

```ts
// matches /api/users/123, /api/users/abc, /api/users/any-id
defineSchema('/api/users/:id', {
  id:    { type: 'string' },
  name:  { type: 'string' },
  email: { type: 'string' },
});

// * also works as a wildcard segment
defineSchema('/api/users/*', {
  id:   { type: 'string' },
  name: { type: 'string' },
});

// deeply nested dynamic routes
defineSchema('/api/orgs/:orgId/members/:memberId', {
  id:   { type: 'string' },
  role: { type: 'string' },
});
```

Query strings are automatically stripped before matching — `/api/users/123?include=posts` matches `/api/users/:id` cleanly.

---

## Strict mode

By default, `api-diff` only checks fields you defined in the schema. Strict mode flips this — it also flags fields the backend added that weren't in your schema at all.

```ts
init({ mode: 'warn', strict: true });
```

If your backend adds a new field you didn't define:

```
[api-diff] Contract drift on /api/users:
  • newField: expected not in schema, got string
```

This catches backend API changes in both directions — missing fields and unexpected additions. Useful for detecting when a backend redesign is silently underway.

---

## onDrift callback

React to drift in your own way — send it to Sentry, your analytics, a Slack webhook, or your own backend endpoint.

```ts
init({
  mode: 'warn',
  onDrift: (url, drifts) => {
    // url   — the endpoint that drifted
    // drifts — array of DriftItem describing exactly what changed

    // send to Sentry
    Sentry.captureMessage('API contract drift', {
      extra: { url, drifts }
    });

    // or log to your analytics
    analytics.track('api_drift', { url, drifts });

    // or post to your own endpoint
    fetch('/internal/drift-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, drifts })
    });
  }
});
```

The callback fires regardless of mode — combine with `silent` in production to collect drift data without surfacing any console output to users:

```ts
// production — collect silently, send to your backend
init({
  mode: 'silent',
  onDrift: (url, drifts) => {
    fetch('/internal/drift-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, drifts, timestamp: Date.now() })
    });
  }
});
```

---

## Schema reference

### Supported types

| Type | Matches |
|------|---------|
| `string` | `typeof value === 'string'` |
| `number` | `typeof value === 'number'` |
| `boolean` | `typeof value === 'boolean'` |
| `object` | Plain objects — supports nested `fields` |
| `array` | `Array.isArray(value)` — supports `items` for item validation |
| `null` | `value === null` |

### Field options

```ts
defineSchema('/api/endpoint', {
  fieldName: {
    type: 'string',       // required — one of the types above
    required: true,       // optional — defaults to true
    fields: { ... },      // optional — only when type is 'object'
    items: { ... },       // optional — only when type is 'array'
  }
});
```

---

## Examples

### Flat response

```ts
defineSchema('/api/profile', {
  id:        { type: 'string' },
  username:  { type: 'string' },
  followers: { type: 'number' },
  verified:  { type: 'boolean' },
  bio:       { type: 'string', required: false },
});
```

### Nested object

```ts
defineSchema('/api/loans', {
  loanId: { type: 'string' },
  amount: { type: 'number' },
  status: { type: 'string' },
  user: {
    type: 'object',
    fields: {
      id:    { type: 'string' },
      name:  { type: 'string' },
      email: { type: 'string' },
    }
  },
});
```

### Array with item validation

Validate every item inside an array response — drift is reported with the exact index that failed.

```ts
defineSchema('/api/users', {
  users: {
    type: 'array',
    items: {
      id:     { type: 'string' },
      name:   { type: 'string' },
      active: { type: 'boolean' },
    }
  }
});
```

If the second item in the array has a wrong type:

```
[api-diff] Contract drift on /api/users:
  • users[1].id: expected string, got number
```

### Dynamic routes with wildcard matching

```ts
// covers /api/products/123, /api/products/shoes-001, etc.
defineSchema('/api/products/:id', {
  id:       { type: 'string' },
  name:     { type: 'string' },
  price:    { type: 'number' },
  inStock:  { type: 'boolean' },
});

// covers /api/orgs/acme/members/42
defineSchema('/api/orgs/:orgId/members/:memberId', {
  id:       { type: 'string' },
  username: { type: 'string' },
  role:     { type: 'string' },
});
```

### Strict mode with callback

```ts
init({
  mode: 'warn',
  strict: true,
  onDrift: (url, drifts) => {
    const unexpected = drifts.filter(d => d.severity === 'unexpected');
    if (unexpected.length > 0) {
      console.info(`[api-diff] Backend added ${unexpected.length} new field(s) to ${url}`);
    }
  }
});
```

### Multiple endpoints

```ts
defineSchema('/api/users',       { id: { type: 'string' }, name: { type: 'string' } });
defineSchema('/api/users/:id',   { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' } });
defineSchema('/api/products/:id',{ sku: { type: 'string' }, price: { type: 'number' } });
defineSchema('/api/orders/:id',  { orderId: { type: 'string' }, total: { type: 'number' } });

init({ mode: 'warn', strict: true });
// All endpoints monitored simultaneously
```

### Using with tests (throw mode)

```ts
import { init, defineSchema, restore } from '@nakshatra6350/api-diff';

beforeAll(() => {
  defineSchema('/api/users/:id', {
    id:   { type: 'string' },
    name: { type: 'string' },
  });
  init({ mode: 'throw', strict: true }); // fails immediately on any drift
});

afterAll(() => {
  restore(); // removes the fetch interceptor
});
```

---

## API

### `defineSchema(url, schema)`

Registers a contract for a URL pattern. Supports exact URLs, `:param` segments, and `*` wildcards.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | URL pattern — exact, `:param`, or `*` wildcard |
| `schema` | `ApiSchema` | Shape definition for the response |

### `init(config?)`

Installs the fetch interceptor globally. Call this once at your app's entry point.

```ts
// simple string
init('warn');

// full config object
init({
  mode: 'warn',
  strict: false,
  onDrift: (url, drifts) => { ... }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'warn' \| 'throw' \| 'silent'` | `'warn'` | What to do when drift is detected |
| `strict` | `boolean` | `false` | Also flag unexpected fields not in schema |
| `onDrift` | `(url: string, drifts: DriftItem[]) => void` | `undefined` | Callback fired on every drift event |

### `restore()`

Removes the fetch interceptor and restores the original `fetch`. Useful in tests to clean up after each suite.

---

## TypeScript support

Full TypeScript support is included out of the box — no `@types` package needed.

```ts
import type { 
  ApiSchema, 
  DiffResult, 
  DriftItem, 
  DiffMode, 
  InitConfig, 
  OnDriftCallback 
} from '@nakshatra6350/api-diff';

const schema: ApiSchema = {
  id:   { type: 'string' },
  name: { type: 'string' },
};

const handleDrift: OnDriftCallback = (url, drifts) => {
  console.table(drifts);
};

init({ mode: 'warn', strict: true, onDrift: handleDrift });
```

---

## How it works

1. You call `defineSchema()` to register URL patterns → schema pairs. Patterns are compiled to regex at registration time — zero overhead per request
2. You call `init()` which wraps `globalThis.fetch` with a thin interceptor
3. Every `fetch` call passes through the interceptor
4. If the URL matches a registered pattern (after stripping query strings), the response is cloned and parsed
5. The parsed JSON is deep-compared against the schema — field by field, type by type, index by index for arrays
6. In strict mode, the response is also checked for fields not present in the schema
7. If an `onDrift` callback is set, it fires first with the full drift report
8. Drift is then reported via `console.warn`, thrown as an `Error`, or silently swallowed — depending on your mode
9. The original response is returned untouched — your app continues to work normally

---

## Why not OpenAPI or Zod?

| Tool | When to use it |
|------|----------------|
| OpenAPI validators | You own the backend and can generate specs — heavy setup, needs backend cooperation |
| Zod | Compile-time + runtime validation wired into your data layer — great but requires active maintenance |
| **api-diff** | Runtime drift detection with zero backend changes and a 5-line setup — a safety net, not a replacement |

`api-diff` sits below your TypeScript types and Zod schemas as an early warning system at the network boundary. When your types go stale, `api-diff` still catches it.

---

## Changelog

### v0.3.0
- ✨ Wildcard URL matching — `:param` and `*` segment patterns for dynamic REST routes
- ✨ Strict mode — flag unexpected fields the backend added that aren't in your schema
- ✨ `strict` option added to `InitConfig`
- 🔧 Query strings are now stripped before URL pattern matching

### v0.2.0
- ✨ Array item validation — validate every item in an array response with exact index in error path
- ✨ `onDrift` callback — pipe drift events to Sentry, analytics, or your own endpoint
- ✨ `init()` now accepts a config object in addition to a mode string
- 📦 New exports: `InitConfig`, `OnDriftCallback`

### v0.1.0
- 🚀 Initial release
- Runtime fetch interception
- Deep schema diffing for flat and nested objects
- Three modes: warn, throw, silent
- Full TypeScript support

---

## Contributing

Issues and PRs are welcome. Please open an issue first to discuss any large changes.

```bash
git clone https://github.com/nakshatra6350/api-diff.git
cd api-diff
npm install
npm test
```

---

## License

MIT © [Nakshatra](https://github.com/nakshatra6350)