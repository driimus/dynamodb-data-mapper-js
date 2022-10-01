import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ZeroArgumentsConstructor } from '@driimus/dynamodb-data-marshaller';

import { Iterator } from './Iterator';
import type { ParallelScanOptions } from './namedParameters';
import { ParallelScanPaginator } from './ParallelScanPaginator';

/**
 * Iterates over each item returned by a parallel DynamoDB scan until no more
 * pages are available.
 */
export class ParallelScanIterator<T extends Record<string, unknown>> extends Iterator<
  T,
  ParallelScanPaginator<T>
> {
  constructor(
    client: DynamoDBClient,
    itemConstructor: ZeroArgumentsConstructor<T>,
    segments: number,
    options: ParallelScanOptions & { tableNamePrefix?: string } = {}
  ) {
    super(new ParallelScanPaginator(client, itemConstructor, segments, options));
  }
}
