import type { NumberType } from '@driimus/dynamodb-data-marshaller';

import type { PropertyAnnotation } from './annotationShapes';
import { attribute } from './attribute';

export function versionAttribute(parameters: Partial<NumberType> = {}): PropertyAnnotation {
  return attribute({
    ...parameters,
    type: 'Number',
    versionAttribute: true,
  });
}
