import type { DynamoDBClient, QueryInput } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/client-dynamodb';

import { DynamoDbPaginator } from './DynamoDbPaginator';
import type { DynamoDbResultsPage } from './DynamoDbResultsPage';

export class QueryPaginator extends DynamoDbPaginator {
  private nextRequest?: QueryInput;

  constructor(private readonly client: DynamoDBClient, input: QueryInput, limit?: number) {
    super(limit);
    this.nextRequest = { ...input };
  }

  protected async getNext(): Promise<IteratorResult<DynamoDbResultsPage>> {
    if (this.nextRequest) {
      const output = await this.client.send(
        new QueryCommand({
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
