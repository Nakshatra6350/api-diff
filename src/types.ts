export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';

export interface SchemaField {
  type: FieldType;
  required?: boolean;
  fields?: Record<string, SchemaField>;
  items?: Record<string, SchemaField>;
}

export interface ApiSchema {
  [key: string]: SchemaField;
}

export type DiffMode = 'warn' | 'throw' | 'silent';

export type OnDriftCallback = (url: string, drifts: DriftItem[]) => void;

export type InitConfig = {
  mode?: DiffMode;
  onDrift?: OnDriftCallback;
  strict?: boolean;
  ignore?: string[];
  maxResponseTime?: number;
  enabled?: boolean;
};

export interface DiffResult {
  passed: boolean;
  drifts: DriftItem[];
}

export type DriftSeverity = 'breaking' | 'warning' | 'info';

export interface DriftItem {
  field: string;
  expected: string;
  received: string;
  severity: 'missing' | 'type_mismatch' | 'unexpected';
  driftSeverity: DriftSeverity;
  responseTime?: number;
}