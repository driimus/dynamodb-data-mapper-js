import {ScanPaginator as BasePaginator} from '@aws/dynamodb-query-iterator';
import {ZeroArgumentsConstructor} from '@aws/dynamodb-data-marshaller';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {buildScanInput} from './buildScanInput';
import {SequentialScanOptions} from './namedParameters';
import {Paginator} from './Paginator';

/**
 * Iterates over each page of items returned by a DynamoDB scan until no more
 * pages are available.
 */
export class ScanPaginator<T> extends Paginator<T> {
	constructor(
		client: DynamoDBClient,
		itemConstructor: ZeroArgumentsConstructor<T>,
		options: SequentialScanOptions = {},
	) {
		super(
			new BasePaginator(
				client,
				buildScanInput(itemConstructor, options),
				options.limit,
			),
			itemConstructor,
		);
	}
}
