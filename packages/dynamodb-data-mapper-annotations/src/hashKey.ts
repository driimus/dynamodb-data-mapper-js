import type {
  BinaryType,
  CustomType,
  DateType,
  NumberType,
  StringType,
} from '@driimus/dynamodb-data-marshaller';

import type { PropertyAnnotation } from './annotationShapes';
import { attribute } from './attribute';

export function hashKey(
  parameters: Partial<BinaryType | CustomType<any> | DateType | NumberType | StringType> = {}
): PropertyAnnotation {
  return attribute({
    ...parameters,
    keyType: 'HASH',
  });
}
