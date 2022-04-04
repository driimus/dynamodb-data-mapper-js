import type { DynamoDBClient, ScanInput } from '@aws-sdk/client-dynamodb';
import { ScanCommand } from '@aws-sdk/client-dynamodb';

import { DynamoDbPaginator } from './DynamoDbPaginator';
import type { DynamoDbResultsPage } from './DynamoDbResultsPage';

export class ScanPaginator extends DynamoDbPaginator {
  private nextRequest?: ScanInput;

  constructor(private readonly client: DynamoDBClient, input: ScanInput, limit?: number) {
    super(limit);
    this.nextRequest = {
      ...input,
      Limit: this.getNextPageSize(input.Limit),
    };
  }

  protected async getNext(): Promise<IteratorResult<DynamoDbResultsPage>> {
    if (this.nextRequest) {
      const output = await this.client.send(
        new ScanCommand({
          ...this.nextRequest,
          Limit: this.getNextPageSize(this.nextRequest.Limit),
        })
      );

      this.nextRequest =
        this.nextRequest && output.LastEvaluatedKey
          ? {
              ...this.nextRequest,
              ExclusiveStartKey: output.LastEvaluatedKey,
            }
          : undefined;

      return {
        value: output,
        done: false,
      };
    }

    return {
      done: true,
    } as IteratorResult<DynamoDbResultsPage>;
  }
}
