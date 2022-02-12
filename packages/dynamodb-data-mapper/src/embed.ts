import {
	DocumentType,
	Schema,
} from '@aws/dynamodb-data-marshaller';
import {DynamoDbSchema} from './protocols';

export interface DocumentTypeOptions<T> {
	defaultProvider?: () => T;
	attributeName?: string;
}

declare class DocumentClass {
	[DynamoDbSchema]?: Schema;
}

export function embed<T extends DocumentClass>(
	documentConstructor: {prototype: T; new(): T},
	{attributeName, defaultProvider}: DocumentTypeOptions<T> = {},
): DocumentType {
	return {
		type: 'Document',
		members: documentConstructor.prototype[DynamoDbSchema] ?? {},
		attributeName,
		defaultProvider,
		valueConstructor: documentConstructor,
	};
}
