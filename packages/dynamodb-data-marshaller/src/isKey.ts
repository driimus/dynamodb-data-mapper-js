import type { SchemaType } from './SchemaType';

export function isKey(fieldSchema: SchemaType, indexName?: string): boolean {
  if (
    fieldSchema.type === 'Binary' ||
    fieldSchema.type === 'Custom' ||
    fieldSchema.type === 'Date' ||
    fieldSchema.type === 'Number' ||
    fieldSchema.type === 'String'
  ) {
    return indexName
      ? Boolean(fieldSchema.indexKeyConfigurations?.[indexName])
      : Boolean(fieldSchema.keyType);
  }

  return false;
}
