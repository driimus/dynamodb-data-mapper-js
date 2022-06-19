import type { DynamoDBClient, QueryInput } from '@aws-sdk/client-dynamodb';
import type { ZeroArgumentsConstructor } from '@driimus/dynamodb-data-marshaller';
import {
  marshallConditionExpression,
  marshallProjectionExpression,
} from '@driimus/dynamodb-data-marshaller';
import type {
  ConditionExpression,
  ConditionExpressionPredicate,
} from '@driimus/dynamodb-expressions';
import {
  ExpressionAttributes,
  isConditionExpression,
  isConditionExpressionPredicate,
} from '@driimus/dynamodb-expressions';
import { QueryPaginator as BasePaginator } from '@driimus/dynamodb-query-iterator';

import { marshallStartKey } from './marshallStartKey';
import type { QueryOptions } from './namedParameters';
import { Paginator } from './Paginator';
import { getSchema, getTableName } from './protocols';

/**
 * Iterates over each page of items returned by a DynamoDB query until no more
 * pages are available.
 */
export class QueryPaginator<T> extends Paginator<T> {
  constructor(
    client: DynamoDBClient,
    valueConstructor: ZeroArgumentsConstructor<T>,
    keyCondition: ConditionExpression | Record<string, ConditionExpressionPredicate | any>,
    options: QueryOptions & { tableNamePrefix?: string } = {}
  ) {
    const itemSchema = getSchema(valueConstructor.prototype);

    const {
      filter,
      indexName,
      limit,
      pageSize,
      projection,
      readConsistency,
      scanIndexForward,
      startKey,
      tableNamePrefix: prefix,
    } = options;

    const request: QueryInput = {
      TableName: getTableName(valueConstructor.prototype, prefix),
      ScanIndexForward: scanIndexForward,
      Limit: pageSize,
      IndexName: indexName,
    };

    if (readConsistency === 'strong') {
      request.ConsistentRead = true;
    }

    const attributes = new ExpressionAttributes();
    request.KeyConditionExpression = marshallConditionExpression(
      normalizeKeyCondition(keyCondition),
      itemSchema,
      attributes
    ).expression;

    if (filter) {
      request.FilterExpression = marshallConditionExpression(
        filter,
        itemSchema,
        attributes
      ).expression;
    }

    if (projection) {
      request.ProjectionExpression = marshallProjectionExpression(
        projection,
        itemSchema,
        attributes
      ).expression;
    }

    if (Object.keys(attributes.names).length > 0) {
      request.ExpressionAttributeNames = attributes.names;
    }

    if (Object.keys(attributes.values).length > 0) {
      request.ExpressionAttributeValues = attributes.values;
    }

    if (startKey) {
      request.ExclusiveStartKey = marshallStartKey(itemSchema, startKey);
    }

    super(new BasePaginator(client, request, limit), valueConstructor);
  }
}

function normalizeKeyCondition(
  keyCondition: ConditionExpression | Record<string, ConditionExpressionPredicate | any>
): ConditionExpression {
  if (isConditionExpression(keyCondition)) {
    return keyCondition;
  }

  const conditions: ConditionExpression[] = [];
  for (const property of Object.keys(keyCondition)) {
    const predicate = keyCondition[property];
    if (isConditionExpressionPredicate(predicate)) {
      conditions.push({
        ...predicate,
        subject: property,
      });
    } else {
      conditions.push({
        type: 'Equals',
        subject: property,
        object: predicate,
      });
    }
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { type: 'And', conditions };
}
