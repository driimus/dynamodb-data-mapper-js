import type { ScanInput } from '@aws-sdk/client-dynamodb';
import type { ZeroArgumentsConstructor } from 'ddb-data-marshaller';
import { marshallConditionExpression, marshallProjectionExpression } from 'ddb-data-marshaller';
import { ExpressionAttributes } from 'ddb-expressions';

import { marshallStartKey } from './marshallStartKey';
import type { SequentialScanOptions } from './namedParameters';
import { getSchema, getTableName } from './protocols';

/**
 * @internal
 */
export function buildScanInput<T>(
  valueConstructor: ZeroArgumentsConstructor<T>,
  options: SequentialScanOptions = {}
): ScanInput {
  const {
    filter,
    indexName,
    pageSize,
    projection,
    readConsistency,
    segment,
    startKey,
    tableNamePrefix: prefix,
    totalSegments,
  } = options;

  const request: ScanInput = {
    TableName: getTableName(valueConstructor.prototype, prefix),
    Limit: pageSize,
    IndexName: indexName,
    Segment: segment,
    TotalSegments: totalSegments,
  };

  if (readConsistency === 'strong') {
    request.ConsistentRead = true;
  }

  const schema = getSchema(valueConstructor.prototype);

  const attributes = new ExpressionAttributes();

  if (filter) {
    request.FilterExpression = marshallConditionExpression(filter, schema, attributes).expression;
  }

  if (projection) {
    request.ProjectionExpression = marshallProjectionExpression(
      projection,
      schema,
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
    request.ExclusiveStartKey = marshallStartKey(schema, startKey);
  }

  return request;
}
