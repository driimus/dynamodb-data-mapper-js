import {DynamoDBClient, ScanCommand} from '@aws-sdk/client-dynamodb';
import {mockClient} from 'aws-sdk-client-mock';
import {ParallelScanIterator} from '.';

describe('ParallelScanIterator', () => {
	const promiseFunc = jest.fn();
	const mockDynamoDbClient = mockClient(DynamoDBClient);

	beforeEach(() => {
		mockDynamoDbClient.reset();
		mockDynamoDbClient.on(ScanCommand).callsFake(promiseFunc);
	});

	it('should paginate over results and return a promise for each item', async () => {
		const segments = 2;
		const keys = ['snap', 'crackle', 'pop', 'foo', 'bar', 'baz'];
		let index = 0;

		// Ensure that the first promise won't resolve immediately. This
		// would block progress on a sequential scan but should pose no
		// problem for a parallel one.
		promiseFunc.mockImplementationOnce(
			async () =>
				new Promise(resolve => {
					setTimeout(
						resolve.bind(null, {
							Items: [
								{
									fizz: {S: 'quux'},
									bar: {NS: ['5', '12', '13']},
									baz: {L: [{BOOL: true}, {N: '101'}]},
								},
							],
						}),
						50,
					);
				}),
		);

		// Enqueue a number of responses that will resolve synchronously
		for (const key of keys) {
			const response = Promise.resolve({
				Items: [
					{
						fizz: {S: key},
						bar: {
							NS: [
								(++index).toString(10),
								(++index).toString(10),
							],
						},
						baz: {
							L: [
								{BOOL: index % 2 === 0},
								{N: (++index).toString(10)},
							],
						},
					},
				],
				LastEvaluatedKey: {fizz: {S: key}},
			});
			promiseFunc.mockImplementationOnce(async () => response);
		}

		// Enqueue a final page for this segment
		promiseFunc.mockImplementationOnce(async () =>
			Promise.resolve({Items: []}),
		);

		const result: any[] = [];
		for await (const scanResult of new ParallelScanIterator(
			mockDynamoDbClient as unknown as DynamoDBClient,
			{
				TableName: 'foo',
				TotalSegments: segments,
			},
		)) {
			result.push(scanResult);
		}

		expect(result).toEqual([
			{
				fizz: {S: 'snap'},
				bar: {NS: ['1', '2']},
				baz: {L: [{BOOL: true}, {N: '3'}]},
			},
			{
				fizz: {S: 'crackle'},
				bar: {NS: ['4', '5']},
				baz: {L: [{BOOL: false}, {N: '6'}]},
			},
			{
				fizz: {S: 'pop'},
				bar: {NS: ['7', '8']},
				baz: {L: [{BOOL: true}, {N: '9'}]},
			},
			{
				fizz: {S: 'foo'},
				bar: {NS: ['10', '11']},
				baz: {L: [{BOOL: false}, {N: '12'}]},
			},
			{
				fizz: {S: 'bar'},
				bar: {NS: ['13', '14']},
				baz: {L: [{BOOL: true}, {N: '15'}]},
			},
			{
				fizz: {S: 'baz'},
				bar: {NS: ['16', '17']},
				baz: {L: [{BOOL: false}, {N: '18'}]},
			},
			{
				fizz: {S: 'quux'},
				bar: {NS: ['5', '12', '13']},
				baz: {L: [{BOOL: true}, {N: '101'}]},
			},
		]);
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

		promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

		const iterator = new ParallelScanIterator(mockDynamoDbClient as unknown as DynamoDBClient, {
			TableName: 'foo',
			TotalSegments: 2,
		});

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		for await (const _ of iterator) {
			// Pass
		}

		expect(iterator.count).toBe(3);
		expect(iterator.scannedCount).toBe(6);
		expect(iterator.consumedCapacity).toMatchObject({
			TableName: 'foo',
			CapacityUnits: 6,
		});
	});
});
