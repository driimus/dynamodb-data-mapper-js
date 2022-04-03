import type { Schema } from './SchemaType';
import { isSchemaType } from './SchemaType';

/**
 * Evaluates whether the provided argument is a Schema object
 */
export function isSchema(arg: any): arg is Schema {
  if (!arg || typeof arg !== 'object') {
    return false;
  }

  for (const key of Object.keys(arg)) {
    if (!isSchemaType(arg[key])) {
      return false;
    }
  }

  return true;
}
