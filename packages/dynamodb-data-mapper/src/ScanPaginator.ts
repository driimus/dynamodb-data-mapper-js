import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ZeroArgumentsConstructor } from '@driimus/dynamodb-data-marshaller';
import { ScanPaginator as BasePaginator } from '@driimus/dynamodb-query-iterator';

import { buildScanInput } from './buildScanInput';
import type { SequentialScanOptions } from './namedParameters';
import { Paginator } from './Paginator';

/**
 * Iterates over each page of items returned by a DynamoDB scan until no more
 * pages are available.
 */
export class ScanPaginator<T> extends Paginator<T> {
  constructor(
    client: DynamoDBClient,
    itemConstructor: ZeroArgumentsConstructor<T>,
    options: SequentialScanOptions = {}
  ) {
    super(
      new BasePaginator(client, buildScanInput(itemConstructor, options), options.limit),
      itemConstructor
    );
  }
}
