export { defineSchema, clearRegistry } from './schema.js';
export { init, restore, isActive } from './interceptor.js';
export type {
  ApiSchema,
  SchemaField,
  FieldType,
  DiffResult,
  DriftItem,
  DiffMode,
  InitConfig,
  OnDriftCallback,
} from './types.js';