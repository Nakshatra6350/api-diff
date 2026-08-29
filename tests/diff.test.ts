import { describe, it, expect } from 'vitest';
import { diffResponse } from '../src/diff.js';

describe('diffResponse', () => {

  // ── core ──────────────────────────────────────────────────

  it('passes when all fields match', () => {
    const result = diffResponse(
      { id: '1', name: 'Nakshatra', active: true },
      {
        id:     { type: 'string' },
        name:   { type: 'string' },
        active: { type: 'boolean' },
      }
    );
    expect(result.passed).toBe(true);
    expect(result.drifts).toHaveLength(0);
  });

  it('catches a missing required field', () => {
    const result = diffResponse(
      { id: '1' },
      { id: { type: 'string' }, name: { type: 'string' } }
    );
    expect(result.passed).toBe(false);
    expect(result.drifts[0].severity).toBe('missing');
    expect(result.drifts[0].field).toBe('name');
  });

  it('does not flag optional missing field', () => {
    const result = diffResponse(
      { id: '1' },
      { id: { type: 'string' }, bio: { type: 'string', required: false } }
    );
    expect(result.passed).toBe(true);
  });

  it('catches a type mismatch', () => {
    const result = diffResponse(
      { amount: '500' },
      { amount: { type: 'number' } }
    );
    expect(result.passed).toBe(false);
    expect(result.drifts[0].severity).toBe('type_mismatch');
    expect(result.drifts[0].field).toBe('amount');
  });

  // ── nested objects ────────────────────────────────────────

  it('recurses into nested objects', () => {
    const result = diffResponse(
      { user: { id: '1', name: 123 } },
      {
        user: {
          type: 'object',
          fields: {
            id:   { type: 'string' },
            name: { type: 'string' },
          },
        },
      }
    );
    expect(result.passed).toBe(false);
    expect(result.drifts[0].field).toBe('user.name');
    expect(result.drifts[0].severity).toBe('type_mismatch');
  });

  // ── array item validation ─────────────────────────────────

  it('validates array item schemas with exact index', () => {
    const result = diffResponse(
      {
        users: [
          { id: '1', name: 'Nakshatra' },
          { id: 2,   name: 'Dev' },
        ],
      },
      {
        users: {
          type: 'array',
          items: {
            id:   { type: 'string' },
            name: { type: 'string' },
          },
        },
      }
    );
    expect(result.passed).toBe(false);
    expect(result.drifts[0].field).toBe('users[1].id');
    expect(result.drifts[0].severity).toBe('type_mismatch');
  });

  // ── strict mode ───────────────────────────────────────────

  it('strict mode catches unexpected fields', () => {
    const result = diffResponse(
      { id: '1', name: 'Nakshatra', surprise: 'field' },
      { id: { type: 'string' }, name: { type: 'string' } },
      '',
      true
    );
    expect(result.passed).toBe(false);
    expect(result.drifts[0].severity).toBe('unexpected');
    expect(result.drifts[0].field).toBe('surprise');
  });

  it('strict mode passes when no unexpected fields', () => {
    const result = diffResponse(
      { id: '1', name: 'Nakshatra' },
      { id: { type: 'string' }, name: { type: 'string' } },
      '',
      true
    );
    expect(result.passed).toBe(true);
  });

  // ── ignore — bare field name ──────────────────────────────

  it('bare ignore skips field everywhere including array items', () => {
    const result = diffResponse(
      {
        __v: 0,
        users: [
          { id: '1', __v: 0 },
          { id: '2', __v: 1 },
        ],
      },
      {
        users: {
          type: 'array',
          items: { id: { type: 'string' } },
        },
      },
      '',
      true,
      ['__v']
    );
    expect(result.passed).toBe(true);
  });

  it('bare ignore still catches non-ignored unexpected fields', () => {
    const result = diffResponse(
      { id: '1', name: 'Nakshatra', __v: 0, extra: 'surprise' },
      { id: { type: 'string' }, name: { type: 'string' } },
      '',
      true,
      ['__v']
    );
    expect(result.passed).toBe(false);
    expect(result.drifts.some(d => d.field === '__v')).toBe(false);
    expect(result.drifts.some(d => d.field === 'extra')).toBe(true);
  });

  // ── ignore — root. prefix ─────────────────────────────────

  it('root. prefix ignores field only at root, not inside array items', () => {
    const result = diffResponse(
      {
        createdOnDate: '2026-01-01',
        users: [
          { id: '1', createdOnDate: '2026-01-01' },
        ],
      },
      {
        users: {
          type: 'array',
          items: { id: { type: 'string' } },
        },
      },
      '',
      true,
      ['root.createdOnDate']
    );
    expect(result.drifts.some(d => d.field === 'createdOnDate')).toBe(false);
    expect(result.drifts.some(d => d.field === 'users[0].createdOnDate')).toBe(true);
  });

  // ── ignore — [*] wildcard ─────────────────────────────────

  it('[*] wildcard ignores field inside array items but not at root', () => {
    const result = diffResponse(
      {
        createdOnDate: '2026-01-01',
        users: [
          { id: '1', createdOnDate: '2026-01-01' },
          { id: '2', createdOnDate: '2026-01-02' },
        ],
      },
      {
        users: {
          type: 'array',
          items: { id: { type: 'string' } },
        },
      },
      '',
      true,
      ['users[*].createdOnDate']
    );
    expect(result.drifts.some(d => d.field === 'createdOnDate')).toBe(true);
    expect(result.drifts.some(d => d.field === 'users[0].createdOnDate')).toBe(false);
    expect(result.drifts.some(d => d.field === 'users[1].createdOnDate')).toBe(false);
  });

  // ── ignore — combined patterns ────────────────────────────

  it('combined ignore patterns work together', () => {
    const result = diffResponse(
      {
        createdOnDate: '2026-01-01',
        __v: 0,
        users: [
          { id: '1', createdOnDate: '2026-01-01', __v: 0 },
        ],
      },
      {
        users: {
          type: 'array',
          items: { id: { type: 'string' } },
        },
      },
      '',
      true,
      ['root.createdOnDate', '__v']
    );
    expect(result.drifts.some(d => d.field === 'createdOnDate')).toBe(false);
    expect(result.drifts.some(d => d.field === '__v')).toBe(false);
    expect(result.drifts.some(d => d.field === 'users[0].__v')).toBe(false);
    expect(result.drifts.some(d => d.field === 'users[0].createdOnDate')).toBe(true);
  });

  // ── null and edge types ───────────────────────────────────

  it('correctly identifies null type', () => {
    const result = diffResponse(
      { value: null },
      { value: { type: 'null' } }
    );
    expect(result.passed).toBe(true);
  });

  it('reports error when root data is not an object', () => {
    const result = diffResponse(
      'just a string',
      { id: { type: 'string' } }
    );
    expect(result.passed).toBe(false);
    expect(result.drifts[0].severity).toBe('type_mismatch');
    expect(result.drifts[0].field).toBe('root');
  });

});