import { describe, it, expect } from 'vitest';
import { classifySeverity, severityLabel } from '../src/severity.js';
import { diffResponse } from '../src/diff.js';

describe('classifySeverity', () => {

  it('missing field is breaking', () => {
    expect(
      classifySeverity({
        field: 'email',
        expected: 'string',
        received: 'missing',
        severity: 'missing',
      })
    ).toBe('breaking');
  });

  it('type mismatch is breaking', () => {
    expect(
      classifySeverity({
        field: 'id',
        expected: 'string',
        received: 'number',
        severity: 'type_mismatch',
      })
    ).toBe('breaking');
  });

  it('received null is a warning', () => {
    expect(
      classifySeverity({
        field: 'bio',
        expected: 'string',
        received: 'null',
        severity: 'type_mismatch',
      })
    ).toBe('warning');
  });

  it('unexpected field (strict mode) is info', () => {
    expect(
      classifySeverity({
        field: 'newField',
        expected: 'not in schema',
        received: 'string',
        severity: 'unexpected',
      })
    ).toBe('info');
  });

  it('unexpected field stays info even when its value is null', () => {
    expect(
      classifySeverity({
        field: 'newField',
        expected: 'not in schema',
        received: 'null',
        severity: 'unexpected',
      })
    ).toBe('info');
  });

});

describe('severityLabel', () => {

  it('labels breaking', () => {
    expect(severityLabel('breaking')).toContain('BREAKING');
  });

  it('labels warning', () => {
    expect(severityLabel('warning')).toContain('WARNING');
  });

  it('labels info', () => {
    expect(severityLabel('info')).toContain('INFO');
  });

  it('pads every label to the same width so fields line up', () => {
    const widths = (['breaking', 'warning', 'info'] as const).map(
      s => severityLabel(s).length
    );
    expect(new Set(widths).size).toBe(1);
  });

});

describe('diffResponse attaches driftSeverity', () => {

  it('missing field drift is breaking', () => {
    const result = diffResponse(
      { id: '1' },
      { id: { type: 'string' }, email: { type: 'string' } }
    );
    expect(result.drifts).toEqual([
      expect.objectContaining({ field: 'email', severity: 'missing', driftSeverity: 'breaking' }),
    ]);
  });

  it('type mismatch drift is breaking', () => {
    const result = diffResponse(
      { amount: '500' },
      { amount: { type: 'number' } }
    );
    expect(result.drifts).toEqual([
      expect.objectContaining({ field: 'amount', severity: 'type_mismatch', driftSeverity: 'breaking' }),
    ]);
  });

  it('unexpected drift (strict mode) is info', () => {
    const result = diffResponse(
      { id: '1', surprise: 'field' },
      { id: { type: 'string' } },
      '',
      true
    );
    expect(result.drifts).toEqual([
      expect.objectContaining({ field: 'surprise', severity: 'unexpected', driftSeverity: 'info' }),
    ]);
  });

  it('null value where a type is expected is a warning', () => {
    const result = diffResponse(
      { bio: null },
      { bio: { type: 'string' } }
    );
    expect(result.drifts).toEqual([
      expect.objectContaining({ field: 'bio', received: 'null', driftSeverity: 'warning' }),
    ]);
  });

  it('root-level non-object is breaking', () => {
    const result = diffResponse('just a string', { id: { type: 'string' } });
    expect(result.drifts).toEqual([
      expect.objectContaining({ field: 'root', driftSeverity: 'breaking' }),
    ]);
  });

  it('every drift in nested objects and array items carries driftSeverity', () => {
    const result = diffResponse(
      {
        user: { id: 1 },
        users: [{ id: '1', extra: true }, { name: 'Dev' }],
      },
      {
        user:  { type: 'object', fields: { id: { type: 'string' } } },
        users: { type: 'array',  items:  { id: { type: 'string' } } },
      },
      '',
      true
    );
    expect(result.drifts.map(d => [d.field, d.driftSeverity])).toEqual([
      ['user.id', 'breaking'],
      ['users[0].extra', 'info'],
      ['users[1].id', 'breaking'],
      ['users[1].name', 'info'],
    ]);
  });

});
