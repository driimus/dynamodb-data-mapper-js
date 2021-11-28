import { isKey } from './isKey';
import { AttributeMap, marshallValue } from './marshallItem';
import { Schema } from './Schema';

export function marshallKey(
    schema: Schema,
    input: { [key: string]: any },
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
