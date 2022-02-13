import {
	DocumentType,
	// Schema,
	ZeroArgumentsConstructor,
} from '@aws/dynamodb-data-marshaller';
import {DynamoDbSchema} from './protocols';

export interface DocumentTypeOptions<T> {
	defaultProvider?: () => T;
	attributeName?: string;
}

// Declare class DocumentClass {
// 	[DynamoDbSchema]?: Schema;
// }

export function embed<T>(
	documentConstructor: ZeroArgumentsConstructor<T>,
	{attributeName, defaultProvider}: DocumentTypeOptions<T> = {},
): DocumentType {
	return {
		type: 'Document',
		members: documentConstructor.prototype[DynamoDbSchema] || {},
		attributeName,
		defaultProvider,
		valueConstructor: documentConstructor,
	};
}
