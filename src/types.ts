export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';

export interface SchemaField {
  type: FieldType;
  required?: boolean;
  fields?: Record<string, SchemaField>;  // for nested objects
  items?: Record<string, SchemaField>;   // NEW — for array item validation
}

export interface ApiSchema {
  [key: string]: SchemaField;
}

export type DiffMode = 'warn' | 'throw' | 'silent';

// NEW — onDrift callback type
export type OnDriftCallback = (url: string, drifts: DriftItem[]) => void;

// NEW — init now accepts string or config object
export type InitConfig = {
  mode?: DiffMode;
  onDrift?: OnDriftCallback;
};

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