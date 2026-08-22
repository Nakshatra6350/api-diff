export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';

export interface SchemaField {
  type: FieldType;
  required?: boolean;
  fields?: Record<string, SchemaField>; // for nested objects
}

export interface ApiSchema {
  [key: string]: SchemaField;
}

export type DiffMode = 'warn' | 'throw' | 'silent';

export interface DiffResult {
  passed: boolean;
  drifts: DriftItem[];
}

export interface DriftItem {
  field: string;
  expected: string;
  received: string;
  severity: 'missing' | 'type_mismatch' | 'unexpected';
}