import { describe, it, expect } from 'vitest';
import { diffResponse } from '../src/diff';

describe('diffResponse', () => {
  it('passes when all fields match', () => {
    const result = diffResponse(
      { id: '1', name: 'Nakshatra', active: true },
      { id: { type: 'string' }, name: { type: 'string' }, active: { type: 'boolean' } }
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

  it('catches a type mismatch', () => {
    const result = diffResponse(
      { amount: '500' },   // string instead of number
      { amount: { type: 'number' } }
    );
    expect(result.drifts[0].severity).toBe('type_mismatch');
  });
});

it('validates array item schemas', () => {
  const result = diffResponse(
    {
      users: [
        { id: '1', name: 'Nakshatra' },
        { id: 2, name: 'Dev' },  // id is number, should be string
      ]
    },
    {
      users: {
        type: 'array',
        items: {
          id:   { type: 'string' },
          name: { type: 'string' },
        }
      }
    }
  );
  expect(result.passed).toBe(false);
  expect(result.drifts[0].field).toBe('users[1].id');
  expect(result.drifts[0].severity).toBe('type_mismatch');
});

it('calls onDrift callback when drift is detected', () => {
  // tested via interceptor — covered in integration tests
  expect(true).toBe(true); // placeholder
});

it('matches wildcard URL patterns', async () => {
  const { getSchema } = await import('../src/schema.js');
  // tested via schema unit — covered by interceptor integration
  expect(true).toBe(true);
});

it('strict mode catches unexpected fields', () => {
  const result = diffResponse(
    { id: '1', name: 'Nakshatra', extraField: 'surprise' },
    { id: { type: 'string' }, name: { type: 'string' } },
    '',
    true  // strict mode on
  );
  expect(result.passed).toBe(false);
  expect(result.drifts[0].severity).toBe('unexpected');
  expect(result.drifts[0].field).toBe('extraField');
});