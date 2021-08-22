import { DynamoDbPaginator } from './DynamoDbPaginator';
import { DynamoDbResultsPage } from './DynamoDbResultsPage';
import { DynamoDBClient, QueryInput, QueryCommand } from '@aws-sdk/client-dynamodb';

export class QueryPaginator extends DynamoDbPaginator {
    private nextRequest?: QueryInput;

    constructor(
        private readonly client: DynamoDBClient,
        input: QueryInput,
        limit?: number
    ) {
        super(limit);
        this.nextRequest = {...input};
    }

    protected async getNext(): Promise<IteratorResult<DynamoDbResultsPage>> {
        if (this.nextRequest) {
            const output = await this.client.send(new QueryCommand({
                ...this.nextRequest,
                Limit: this.getNextPageSize(this.nextRequest.Limit)
            }));

            if (this.nextRequest && output.LastEvaluatedKey) {
                this.nextRequest = {
                    ...this.nextRequest,
                    ExclusiveStartKey: output.LastEvaluatedKey
                };
            } else {
                this.nextRequest = undefined;
            }
            
            return await Promise.resolve({
                value: output,
                done: false
            });
        }

        return Promise.resolve(
            {done: true} as IteratorResult<DynamoDbResultsPage>
        );
    }
}
