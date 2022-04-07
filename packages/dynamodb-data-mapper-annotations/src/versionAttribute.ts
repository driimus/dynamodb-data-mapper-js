import type { NumberType } from 'ddb-data-marshaller';

import type { PropertyAnnotation } from './annotationShapes';
import { attribute } from './attribute';

export function versionAttribute(parameters: Partial<NumberType> = {}): PropertyAnnotation {
  return attribute({
    ...parameters,
    type: 'Number',
    versionAttribute: true,
  });
}
