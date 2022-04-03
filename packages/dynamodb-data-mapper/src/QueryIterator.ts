import type { ZeroArgumentsConstructor } from '@aws/dynamodb-data-marshaller';
import type { ConditionExpression, ConditionExpressionPredicate } from '@aws/dynamodb-expressions';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { Iterator } from './Iterator';
import type { QueryOptions } from './namedParameters';
import { QueryPaginator } from './QueryPaginator';

/**
 * Iterates over each item returned by a DynamoDB query until no more pages are
 * available.
 */
export class QueryIterator<T> extends Iterator<T, QueryPaginator<T>> {
  constructor(
    client: DynamoDBClient,
    valueConstructor: ZeroArgumentsConstructor<T>,
    keyCondition: ConditionExpression | Record<string, ConditionExpressionPredicate | any>,
    options?: QueryOptions & { tableNamePrefix?: string }
  ) {
    super(new QueryPaginator(client, valueConstructor, keyCondition, options));
  }
}
