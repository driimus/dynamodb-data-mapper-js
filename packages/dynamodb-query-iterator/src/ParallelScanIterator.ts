import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { ItemIterator } from './ItemIterator';
import type { ParallelScanInput } from './ParallelScanInput';
import type { ParallelScanState } from './ParallelScanPaginator';
import { ParallelScanPaginator } from './ParallelScanPaginator';

export class ParallelScanIterator extends ItemIterator<ParallelScanPaginator> {
  constructor(client: DynamoDBClient, input: ParallelScanInput, scanState?: ParallelScanState) {
    super(new ParallelScanPaginator(client, input, scanState));
  }
}
