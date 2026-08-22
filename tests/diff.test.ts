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