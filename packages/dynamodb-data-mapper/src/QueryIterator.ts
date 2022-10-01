import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ZeroArgumentsConstructor } from '@driimus/dynamodb-data-marshaller';
import type {
  ConditionExpression,
  ConditionExpressionPredicate,
} from '@driimus/dynamodb-expressions';

import { Iterator } from './Iterator';
import type { QueryOptions } from './namedParameters';
import { QueryPaginator } from './QueryPaginator';

/**
 * Iterates over each item returned by a DynamoDB query until no more pages are
 * available.
 */
export class QueryIterator<T extends Record<string, unknown>> extends Iterator<
  T,
  QueryPaginator<T>
> {
  constructor(
    client: DynamoDBClient,
    valueConstructor: ZeroArgumentsConstructor<T>,
    keyCondition: ConditionExpression | Record<string, ConditionExpressionPredicate | any>,
    options?: QueryOptions & { tableNamePrefix?: string }
  ) {
    super(new QueryPaginator(client, valueConstructor, keyCondition, options));
  }
}
