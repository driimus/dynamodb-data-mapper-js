import { PropertyAnnotation } from './annotationShapes';
import { hashKey } from './hashKey';
import { StringType } from '@aws/dynamodb-data-marshaller';
import { randomUUID } from 'crypto';

export function autoGeneratedHashKey(
    parameters: Partial<StringType> = {}
): PropertyAnnotation {
    return hashKey({
        ...parameters,
        type: 'String',
        defaultProvider: randomUUID,
    });
}
