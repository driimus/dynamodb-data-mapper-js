import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { ZeroArgumentsConstructor } from 'ddb-data-marshaller';

import { Iterator } from './Iterator';
import type { SequentialScanOptions } from './namedParameters';
import { ScanPaginator } from './ScanPaginator';

/**
 * Iterates over each item returned by a DynamoDB scan until no more pages are
 * available.
 */
export class ScanIterator<T> extends Iterator<T, ScanPaginator<T>> {
  constructor(
    client: DynamoDBClient,
    valueConstructor: ZeroArgumentsConstructor<T>,
    options?: SequentialScanOptions
  ) {
    super(new ScanPaginator(client, valueConstructor, options));
  }
}
