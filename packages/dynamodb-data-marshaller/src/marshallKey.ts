import { isKey } from './isKey';
import type { AttributeMap } from './marshallItem';
import { marshallValue } from './marshallItem';
import type { Schema } from './SchemaType';

export function marshallKey(
  schema: Schema,
  input: Record<string, any>,
  indexName?: string
): AttributeMap {
  const marshalled: AttributeMap = {};

  for (const propertyKey of Object.keys(schema)) {
    const fieldSchema = schema[propertyKey];
    if (isKey(fieldSchema, indexName)) {
      const { attributeName = propertyKey } = fieldSchema;
      const value = marshallValue(fieldSchema, input[propertyKey]);
      if (value) {
        marshalled[attributeName] = value;
      }
    }
  }

  return marshalled;
}
