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

When your API returns a shape that doesn't match, you'll see this immediately:

```
[api-diff] Contract drift on /api/users (142ms):
  • email: expected string, got missing
  • id: expected string, got number
```

---

## Modes

| Mode | Behaviour | Best used in |
|------|-----------|--------------|
| `warn` | `console.warn` on every drift | Development |
| `throw` | Throws an `Error` on first drift | Tests / CI |
| `silent` | No output — use with `onDrift` | Production |

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

Full URLs are matched by their path, so a schema registered as `/api/users` also covers `fetch('https://api.example.com/api/users?page=2')`, `URL` objects, and `Request` objects.

---

## Strict mode

By default, `api-diff` only checks fields you defined in the schema. Strict mode also flags fields the backend added that weren't in your schema — catching API changes in both directions.

```ts
init({ mode: 'warn', strict: true });
```

If your backend silently adds a new field:

```
[api-diff] Contract drift on /api/users (98ms):
  • newInternalField: expected not in schema, got string
```

---

## Ignore list

Skip specific fields from strict mode checks — useful for timestamps, Mongo internals, or any field you don't want to validate.

### Ignore everywhere (bare field name)

```ts
init({
  mode: 'warn',
  strict: true,
  ignore: ['__v', 'updatedAt', 'internalMeta'],
});
```

`__v` is ignored whether it appears at root, inside a nested object, or inside every array item.

### Ignore only at root level

```ts
init({
  mode: 'warn',
  strict: true,
  ignore: ['root.createdOnDate'],
});
```

`createdOnDate` is ignored at the top level of the response but still flagged if it appears inside nested objects or array items.

### Ignore only inside array items

```ts
init({
  mode: 'warn',
  strict: true,
  ignore: ['users[*].createdOnDate'],
});
```

`createdOnDate` is ignored inside every item of the `users` array but still flagged if it appears at root or in other nested objects.

### Ignore at a specific nested path

```ts
init({
  mode: 'warn',
  strict: true,
  ignore: ['meta.debug'],
});
```

Only ignores `debug` when it appears inside the `meta` object.

### Combining patterns

```ts
init({
  mode: 'warn',
  strict: true,
  ignore: [
    '__v',                       // everywhere
    'root.createdOnDate',        // root only
    'users[*].createdOnDate',    // inside users array items only
    'meta.debug',                // inside meta object only
  ],
});
```

---

## onDrift callback

React to drift in your own way — send it to Sentry, analytics, a Slack webhook, or your own backend.

```ts
init({
  mode: 'warn',
  onDrift: (url, drifts) => {
    // url    — the endpoint that drifted
    // drifts — array of DriftItem with field, expected, received, severity, responseTime

    // send to Sentry
    Sentry.captureMessage('API contract drift', {
      extra: { url, drifts }
    });

    // or your own analytics
    analytics.track('api_drift', { url, drifts });
  }
});
```

Combine with `silent` mode in production to collect drift data without any console output:

```ts
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

## Response time tracking

Every drift report includes the response time as a **raw number in milliseconds** — no unit appended so you can use it directly in calculations.

```ts
init({
  mode: 'warn',
  onDrift: (url, drifts) => {
    const ms = drifts[0].responseTime;         // e.g. 1842
    const seconds = ms / 1000;                 // e.g. 1.842
    const isSlow = ms > 2000;                  // boolean check

    console.log(`${url} responded in ${ms}ms`);
  }
});
```

The console output also shows response time automatically:

```
[api-diff] Contract drift on /api/users/123 (1842ms):
  • email: expected string, got missing
```

---

## Max response time

Warn when an endpoint is slow — even if the schema is fine. Useful for catching performance regressions alongside contract changes.

```ts
init({
  mode: 'warn',
  maxResponseTime: 2000, // warn if response takes longer than 2000ms
});
```

When breached:

```
[api-diff] Slow response on /api/users — 2843ms exceeded maxResponseTime of 2000ms
```

Slow + drifting produces both messages. Works with `onDrift` too — the callback fires with the drift items and `responseTime` attached.

---

## Enabled flag

Toggle the interceptor without calling `restore()` — useful for disabling in production conditionally.

```ts
init({
  mode: 'warn',
  enabled: process.env.NODE_ENV !== 'production',
});
```

When `enabled: false`, the interceptor is not installed and `globalThis.fetch` is left untouched.

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
[api-diff] Contract drift on /api/users (67ms):
  • users[1].id: expected string, got number
```

### Full production setup

```ts
import { init, defineSchema } from '@nakshatra6350/api-diff';

defineSchema('/api/users/:id', {
  id:    { type: 'string' },
  name:  { type: 'string' },
  email: { type: 'string' },
  roles: {
    type: 'array',
    items: { name: { type: 'string' } }
  }
});

defineSchema('/api/loans/:id', {
  loanId: { type: 'string' },
  amount: { type: 'number' },
  status: { type: 'string' },
  user: {
    type: 'object',
    fields: {
      id:   { type: 'string' },
      name: { type: 'string' },
    }
  }
});

init({
  mode: 'silent',
  strict: true,
  maxResponseTime: 3000,
  ignore: [
    '__v',
    'updatedAt',
    'root.requestId',
    'roles[*].internalCode',
  ],
  onDrift: (url, drifts) => {
    fetch('/internal/drift-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        drifts,
        timestamp: Date.now(),
        slowFields: drifts.filter(d => (d.responseTime ?? 0) > 3000),
      })
    });
  }
});
```

### Test setup with throw mode

```ts
import { init, defineSchema, restore, clearRegistry } from '@nakshatra6350/api-diff';

beforeAll(() => {
  defineSchema('/api/users/:id', {
    id:   { type: 'string' },
    name: { type: 'string' },
  });
  init({ mode: 'throw', strict: true });
});

afterAll(() => {
  restore();
  clearRegistry();
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

Installs the fetch interceptor globally. Call once at your app's entry point. Calling it again replaces the previous interceptor with the new config — `fetch` is never wrapped twice.

```ts
init('warn');  // simple

init({         // full config
  mode: 'warn',
  strict: false,
  ignore: [],
  maxResponseTime: undefined,
  enabled: true,
  onDrift: (url, drifts) => { ... }
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `'warn' \| 'throw' \| 'silent'` | `'warn'` | What to do when drift is detected |
| `strict` | `boolean` | `false` | Also flag unexpected fields not in schema |
| `ignore` | `string[]` | `[]` | Fields to skip — bare name, `root.field`, `arr[*].field`, or exact path |
| `maxResponseTime` | `number` | `undefined` | Warn when response exceeds this value in ms |
| `enabled` | `boolean` | `true` | Set to `false` to skip interceptor entirely |
| `onDrift` | `(url, drifts) => void` | `undefined` | Callback fired on every drift or slow response event |

### `restore()`

Removes the fetch interceptor and restores the original `fetch`. Use in test teardown. Safe to call more than once, or without a prior `init()`.

### `isActive()`

Returns `true` while the interceptor is installed.

### `clearRegistry()`

Clears all registered schemas. Use in test teardown alongside `restore()`.

---

## TypeScript support

Full TypeScript support ships with the package — no `@types` install needed.

```ts
import type {
  ApiSchema,
  SchemaField,
  FieldType,
  DiffResult,
  DriftItem,
  DiffMode,
  InitConfig,
  OnDriftCallback,
} from '@nakshatra6350/api-diff';

const handleDrift: OnDriftCallback = (url, drifts) => {
  drifts.forEach(d => {
    console.log(d.field);        // string
    console.log(d.expected);     // string
    console.log(d.received);     // string
    console.log(d.severity);     // 'missing' | 'type_mismatch' | 'unexpected'
    console.log(d.responseTime); // number (ms) | undefined
  });
};
```

---

## How it works

1. `defineSchema()` registers URL patterns compiled to regex at registration time — zero overhead per request
2. `init()` wraps `globalThis.fetch` with a thin interceptor
3. Every `fetch` call passes through — if the URL path matches a pattern, the response is considered for inspection
4. Only JSON responses are inspected — `Content-Type` must be `application/json` or end in `+json`. `204` and `304` responses are skipped, as is anything whose `Content-Length` exceeds 1MB (with a warning). `4xx`/`5xx` responses are still checked when they are JSON. Everything that passes is cloned and the clone is parsed
5. The parsed data is deep-compared against the schema field by field, type by type, index by index for arrays
6. In strict mode, the response is also checked for fields not present in the schema
7. The ignore list is evaluated using four matching strategies: bare name, `root.` prefix, `[*]` wildcard, and exact path
8. Response time is measured from just before the original fetch to when it resolves — attached as a raw number to every `DriftItem`
9. If `maxResponseTime` is set and breached, a separate warning fires even when the schema passes
10. The `onDrift` callback fires first, then the console output based on mode
11. The original response is returned untouched — your app continues to work normally

---

## Why not OpenAPI or Zod?

| Tool | When to use it |
|------|----------------|
| OpenAPI validators | You own the backend and can generate specs — heavy setup, needs backend cooperation |
| Zod | Compile-time + runtime validation wired into your data layer — great but requires active schema maintenance |
| **api-diff** | Runtime drift detection at the fetch layer — zero backend changes, 5-line setup, safety net under your types |

These are not competitors. Use Zod for domain validation and `api-diff` as an early warning system at the network boundary. When your Zod schemas go stale, `api-diff` still catches it.

---

## Changelog

### v0.4.0
- ✨ Granular ignore patterns — bare field name (everywhere), `root.field` (root only), `arr[*].field` (array items only), exact path
- ✨ `maxResponseTime` — warn when an endpoint is slow, independent of schema drift
- ✨ `enabled` flag — toggle interceptor without calling `restore()`
- ✨ `responseTime` on `DriftItem` — raw number in ms, no unit string appended
- ✨ `clearRegistry()` — clear all registered schemas, useful in test teardown
- 🔧 Non-JSON responses now emit a `console.debug` in warn mode instead of silently skipping

### v0.3.0
- ✨ Wildcard URL matching — `:param` and `*` segment patterns for dynamic REST routes
- ✨ Strict mode — flag unexpected fields the backend added that aren't in your schema
- 🔧 Query strings stripped before URL pattern matching

### v0.2.0
- ✨ Array item validation — validate every item in an array response with exact index in error path
- ✨ `onDrift` callback — pipe drift events to Sentry, analytics, or your own endpoint
- ✨ `init()` now accepts a config object in addition to a mode string

### v0.1.0
- 🚀 Initial release — runtime fetch interception, deep schema diffing, three modes, full TypeScript support

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