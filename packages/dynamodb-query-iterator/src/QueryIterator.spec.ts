import {DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb';
import {mockClient} from 'aws-sdk-client-mock';
import {QueryIterator, QueryPaginator} from '.';

describe('QueryIterator', () => {
	const promiseFunc = jest.fn();
	const mockDynamoDbClient = mockClient(DynamoDBClient);

	beforeEach(() => {
		mockDynamoDbClient.reset();
		mockDynamoDbClient.on(QueryCommand).callsFake(promiseFunc);
	});

	it('should paginate over results and return a promise for each item', async () => {
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'snap'},
						bar: {NS: ['1', '2', '3']},
						baz: {L: [{BOOL: true}, {N: '4'}]},
					},
				],
				LastEvaluatedKey: {fizz: {S: 'snap'}},
			}),
		);
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'crackle'},
						bar: {NS: ['5', '6', '7']},
						baz: {L: [{BOOL: false}, {N: '8'}]},
					},
				],
				LastEvaluatedKey: {fizz: {S: 'crackle'}},
			}),
		);
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'pop'},
						bar: {NS: ['9', '12', '30']},
						baz: {L: [{BOOL: true}, {N: '24'}]},
					},
				],
				LastEvaluatedKey: {fizz: {S: 'pop'}},
			}),
		);
		promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

		const result: any[] = [];
		for await (const item of new QueryIterator(mockDynamoDbClient as any, {
			TableName: 'foo',
		})) {
			result.push(item);
		}

		expect(result).toEqual([
			{
				fizz: {S: 'snap'},
				bar: {NS: ['1', '2', '3']},
				baz: {L: [{BOOL: true}, {N: '4'}]},
			},
			{
				fizz: {S: 'crackle'},
				bar: {NS: ['5', '6', '7']},
				baz: {L: [{BOOL: false}, {N: '8'}]},
			},
			{
				fizz: {S: 'pop'},
				bar: {NS: ['9', '12', '30']},
				baz: {L: [{BOOL: true}, {N: '24'}]},
			},
		]);
	});

	it('should provide access to the underlying paginator', async () => {
		const iterator = new QueryIterator(mockDynamoDbClient as any, {
			TableName: 'foo',
		});

		expect(iterator.pages()).toBeInstanceOf(QueryPaginator);
	});

	it('should not allow iteration once the paginator has been detached', async () => {
		const iterator = new QueryIterator(mockDynamoDbClient as any, {
			TableName: 'foo',
		});

		// Detach the paginator
		iterator.pages();

		await expect(iterator.next()).rejects.toMatchObject(
			new Error(
				'The underlying paginator has been detached from this iterator.',
			),
		);
	});

	it('should provide access to paginator metadata', async () => {
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'snap'},
						bar: {NS: ['1', '2', '3']},
						baz: {L: [{BOOL: true}, {N: '4'}]},
					},
				],
				LastEvaluatedKey: {fizz: {S: 'snap'}},
				Count: 1,
				ScannedCount: 1,
				ConsumedCapacity: {
					TableName: 'foo',
					CapacityUnits: 2,
				},
			}),
		);
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'crackle'},
						bar: {NS: ['5', '6', '7']},
						baz: {L: [{BOOL: false}, {N: '8'}]},
					},
				],
				LastEvaluatedKey: {fizz: {S: 'crackle'}},
				Count: 1,
				ScannedCount: 2,
				ConsumedCapacity: {
					TableName: 'foo',
					CapacityUnits: 2,
				},
			}),
		);
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'pop'},
						bar: {NS: ['9', '12', '30']},
						baz: {L: [{BOOL: true}, {N: '24'}]},
					},
				],
				Count: 1,
				ScannedCount: 3,
				ConsumedCapacity: {
					TableName: 'foo',
					CapacityUnits: 2,
				},
			}),
		);

		const iterator = new QueryIterator(mockDynamoDbClient as any, {
			TableName: 'foo',
		});

		let expectedCount = 0;
		const expectedScanCounts = [1, 3, 6];
		expect(iterator.count).toBe(expectedCount);
		expect(iterator.scannedCount).toBe(expectedCount);
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for await (const _ of iterator) {
			expect(iterator.count).toBe(++expectedCount);
			expect(iterator.scannedCount).toBe(expectedScanCounts.shift());
		}

		expect(iterator.count).toBe(3);
		expect(iterator.scannedCount).toBe(6);
		expect(iterator.consumedCapacity).toMatchObject({
			TableName: 'foo',
			CapacityUnits: 6,
		});
	});

	it('should not allow iteration once return has been called', async () => {
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({
				Items: [
					{
						fizz: {S: 'snap'},
						bar: {NS: ['1', '2', '3']},
						baz: {L: [{BOOL: true}, {N: '4'}]},
					},
				],
				LastEvaluatedKey: {fizz: {S: 'snap'}},
			}),
		);
		const iterator = new QueryIterator(mockDynamoDbClient as any, {
			TableName: 'foo',
		});

		// eslint-disable-next-line no-unreachable-loop, @typescript-eslint/no-unused-vars
		for await (const _ of iterator) {
			break;
		}

		await expect(iterator.next()).rejects.toMatchObject(
			new Error(
				'Iteration has been manually interrupted and may not be resumed',
			),
		);
	});
});
