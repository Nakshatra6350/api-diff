import type { DriftItem, DriftSeverity } from './types.js';

export function classifySeverity(
  drift: Omit<DriftItem, 'driftSeverity'>
): DriftSeverity {
  if (drift.severity === 'unexpected') return 'info';
  if (drift.received === 'missing') return 'breaking';
  if (drift.received === 'null') return 'warning';
  if (drift.severity === 'type_mismatch') return 'breaking';
  return 'warning';
}

export function severityLabel(s: DriftSeverity): string {
  switch (s) {
    case 'breaking': return '🔴 BREAKING';
    case 'warning':  return '🟡 WARNING ';
    case 'info':     return '🟢 INFO    ';
  }
}
