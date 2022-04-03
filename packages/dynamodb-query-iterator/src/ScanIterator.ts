import type { DynamoDBClient, ScanInput } from '@aws-sdk/client-dynamodb';

import { ItemIterator } from './ItemIterator';
import { ScanPaginator } from './ScanPaginator';

export class ScanIterator extends ItemIterator<ScanPaginator> {
  constructor(client: DynamoDBClient, input: ScanInput, limit?: number) {
    super(new ScanPaginator(client, input, limit));
  }
}
