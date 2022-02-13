import {marshallValue, Schema} from '@aws/dynamodb-data-marshaller';
import {AttributeValue} from '@aws-sdk/client-dynamodb';

export type AttributeMap = Record<string, AttributeValue>;
export type Key = AttributeMap;

/**
 * @internal
 */
export function marshallStartKey(
	schema: Schema,
	startKey: Record<string, any>,
): Key {
	const key: Key = {};
	for (const propertyName of Object.keys(startKey)) {
		const propSchema = schema[propertyName];
		const {attributeName = propertyName} = propSchema;
		if (propSchema) {
			key[attributeName] = marshallValue(
				propSchema,
				startKey[propertyName],
			)!;
		}
	}

	return key;
}
