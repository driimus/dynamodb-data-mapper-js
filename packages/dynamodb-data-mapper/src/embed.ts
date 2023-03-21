import type {
  DocumentType,
  // Schema,
  ZeroArgumentsConstructor,
} from '@driimus/dynamodb-data-marshaller';

import { DynamoDbSchema } from './protocols';

export interface DocumentTypeOptions<T> {
  defaultProvider?: () => T;
  attributeName?: string;
}

// Declare class DocumentClass {
// 	[DynamoDbSchema]?: Schema;
// }

export function embed<T extends Record<string, any>>(
  documentConstructor: ZeroArgumentsConstructor<T>,
  { attributeName, defaultProvider }: DocumentTypeOptions<T> = {}
): DocumentType {
  return {
    type: 'Document',
    members: documentConstructor.prototype[DynamoDbSchema] || {},
    attributeName,
    defaultProvider,
    valueConstructor: documentConstructor,
  };
}
