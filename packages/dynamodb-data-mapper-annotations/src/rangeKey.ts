import type {
  BinaryType,
  CustomType,
  DateType,
  NumberType,
  StringType,
} from '@aws/dynamodb-data-marshaller';

import type { PropertyAnnotation } from './annotationShapes';
import { attribute } from './attribute';

export function rangeKey(
  parameters: Partial<BinaryType | CustomType<any> | DateType | NumberType | StringType> = {}
): PropertyAnnotation {
  return attribute({
    ...parameters,
    keyType: 'RANGE',
  });
}
