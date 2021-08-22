import { ItemIterator } from './ItemIterator';
import { ScanPaginator } from './ScanPaginator';
import { DynamoDBClient, ScanInput } from '@aws-sdk/client-dynamodb';

export class ScanIterator extends ItemIterator<ScanPaginator> {
    constructor(client: DynamoDBClient, input: ScanInput, limit?: number) {
        super(new ScanPaginator(client, input, limit));
    }
}
