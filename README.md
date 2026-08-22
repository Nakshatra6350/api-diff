# @nakshatra6350/api-diff

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
init('warn');   // development
init('throw');  // tests
init('silent'); // production
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
| `array` | `Array.isArray(value)` |
| `null` | `value === null` |

### Field options

```ts
defineSchema('/api/endpoint', {
  fieldName: {
    type: 'string',       // required — one of the types above
    required: true,       // optional — defaults to true
    fields: { ... }       // optional — only valid when type is 'object'
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
  loanId:    { type: 'string' },
  amount:    { type: 'number' },
  status:    { type: 'string' },
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

### Multiple endpoints

```ts
defineSchema('/api/users',    { id: { type: 'string' }, name: { type: 'string' } });
defineSchema('/api/products', { sku: { type: 'string' }, price: { type: 'number' } });
defineSchema('/api/orders',   { orderId: { type: 'string' }, total: { type: 'number' } });

init('warn');
// All three endpoints are now monitored simultaneously
```

### Using with tests (throw mode)

```ts
import { init, defineSchema, restore } from '@nakshatra6350/api-diff';

beforeAll(() => {
  defineSchema('/api/users', {
    id:   { type: 'string' },
    name: { type: 'string' },
  });
  init('throw'); // test fails immediately on any drift
});

afterAll(() => {
  restore(); // removes the fetch interceptor
});
```

---

## API

### `defineSchema(url, schema)`

Registers a contract for a URL pattern. Any `fetch` call whose URL contains this string will be checked against the schema.

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | URL or partial URL to match against |
| `schema` | `ApiSchema` | Shape definition for the response |

### `init(mode?)`

Installs the fetch interceptor globally. Call this once at your app's entry point.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `'warn' \| 'throw' \| 'silent'` | `'warn'` | What to do when drift is detected |

### `restore()`

Removes the fetch interceptor and restores the original `fetch`. Useful in tests to clean up after each suite.

---

## TypeScript support

Full TypeScript support is included out of the box — no `@types` package needed.

```ts
import type { ApiSchema, DiffResult, DriftItem, DiffMode } from '@nakshatra6350/api-diff';

const schema: ApiSchema = {
  id:   { type: 'string' },
  name: { type: 'string' },
};
```

---

## How it works

1. You call `defineSchema()` to register URL → schema pairs in an internal registry
2. You call `init()` which wraps `globalThis.fetch` with an interceptor
3. Every `fetch` call passes through the interceptor
4. If the URL matches a registered schema, the response is cloned and parsed
5. The parsed JSON is deep-compared against the schema — field by field, type by type
6. Drift is reported via `console.warn`, thrown as an `Error`, or silently swallowed — depending on your mode
7. The original response is returned untouched — your app continues to work normally

The interceptor adds zero latency to matched requests (response is cloned, not awaited twice in sequence).

---

## Why not OpenAPI or Zod?

| Tool | When to use it |
|------|----------------|
| OpenAPI validators | You own the backend and can generate specs — heavy setup |
| Zod | You want compile-time + runtime validation wired into your data layer |
| **api-diff** | You want runtime drift detection with zero backend changes and a 5-line setup |

`api-diff` is not a replacement for Zod or OpenAPI. It's a lightweight safety net you drop in at the `fetch` layer — no schema generation, no code-gen, no build step changes.

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