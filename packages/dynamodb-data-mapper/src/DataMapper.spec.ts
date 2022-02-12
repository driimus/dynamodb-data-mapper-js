import {
	BatchGetItemCommand,
	BatchGetItemInput,
	BatchGetItemOutput,
	BatchWriteItemCommand,
	BatchWriteItemInput,
	CreateTableCommand,
	DeleteItemCommand,
	DeleteTableCommand,
	DescribeTableCommand,
	DescribeTableOutput,
	DynamoDBClient,
	GetItemCommand,
	GetItemOutput,
	PutItemCommand,
	PutItemOutput,
	QueryCommand,
	ScanCommand,
	UpdateItemCommand,
	UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';

import {Schema} from '@aws/dynamodb-data-marshaller';
import {
	AttributePath,
	between,
	equals,
	FunctionExpression,
	inList,
	UpdateExpression,
} from '@aws/dynamodb-expressions';
import {mockClient} from 'aws-sdk-client-mock';
import {DataMapper} from './DataMapper';
import {ItemNotFoundException} from './ItemNotFoundException';
import {DynamoDbSchema, DynamoDbTable} from './protocols';
import {
	BatchGetOptions,
	GlobalSecondaryIndexOptions,
	ParallelScanState,
} from '.';

type BinaryValue = ArrayBuffer | ArrayBufferView;

describe('DataMapper', () => {
	it('should set the customUserAgent config property on the client', () => {
		const client: any = {config: {}};
		new DataMapper({client});

		expect(client.config.customUserAgent).toMatchObject(
			expect.arrayContaining([
				['dynamodb-data-mapper-js', expect.any(String)],
			]),
		);
	});

	describe('#batchDelete', () => {
		const promiseFunc = jest.fn(async () =>
			Promise.resolve({
				UnprocessedItems: {},
			}),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);
		mockDynamoDbClient.on(BatchWriteItemCommand).callsFake(promiseFunc);

		beforeEach(() => {
			promiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
			//   MockDynamoDbClient.batchWriteItem.mockClear();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class Item {
			constructor(public fizz?: number) {}

			get [DynamoDbTable](): string {
				return 'foo';
			}

			get [DynamoDbSchema](): Schema {
				return {
					fizz: {
						type: 'Number',
						keyType: 'HASH',
					},
				};
			}
		}

		it.each([true, false])('should should partition delete batches into requests with 25 or fewer items', async asyncInput => {
			const deletes: Item[] = [];
			const expected: any = [
				[{RequestItems: {foo: []}}],
				[{RequestItems: {foo: []}}],
				[{RequestItems: {foo: []}}],
				[{RequestItems: {foo: []}}],
			];
			for (let i = 0; i < 80; i++) {
				deletes.push(new Item(i));
				expected[Math.floor(i / 25)][0].RequestItems.foo.push({
					DeleteRequest: {
						Key: {
							fizz: {N: String(i)},
						},
					},
				});
			}

			const input = asyncInput
				? (async function * () {
					for (const item of deletes) {
						await new Promise(resolve =>
							setTimeout(resolve, Math.round(Math.random())),
						);
						yield item;
					}
				})()
				: deletes;

			for await (const deleted of mapper.batchDelete(input)) {
				expect(deleted).toBeInstanceOf(Item);
			}

			// Const { calls } = mockDynamoDbClient.batchWriteItem.mock;
			// expect(calls.length).toBe(4);
			expect(
				mockDynamoDbClient.commandCalls(BatchWriteItemCommand),
			).toHaveLength(4);
			// Expect(calls).toEqual(expected);
		});

		it.each([true, false])('should should retry unprocessed items', async asyncInput => {
			const deletes: Item[] = [];
			for (let i = 0; i < 80; i++) {
				deletes.push(new Item(i));
			}

			const failures = new Set(['24', '42', '60']);
			for (const failureId of failures) {
				const item = {
					DeleteRequest: {
						Key: {fizz: {N: failureId}},
					},
				};
				promiseFunc.mockImplementationOnce(async () =>
					Promise.resolve({
						UnprocessedItems: {foo: [item]},
					}),
				);
			}

			const input = asyncInput
				? (async function * () {
					for (const item of deletes) {
						await new Promise(resolve =>
							setTimeout(resolve, Math.round(Math.random())),
						);
						yield item;
					}
				})()
				: deletes;

			for await (const deleted of mapper.batchDelete(input)) {
				expect(deleted).toBeInstanceOf(Item);
			}

			// Const { calls } = mockDynamoDbClient.batchWriteItem.mock;
			// expect(calls.length).toBe(4);
			const calls = mockDynamoDbClient.commandCalls(
				BatchWriteItemCommand,
			);
			expect(calls).toHaveLength(4);

			const callCount = calls
				.map(({args: [{input}]}) => input)
				.reduce<Record<string, number>>(
				(
					keyUseCount,
					{
						RequestItems: {foo} = {
							foo: undefined,
						},
					},
				) => {
					for (const {
						DeleteRequest: {
							Key: {
								fizz: {N: key},
							},
						},
					} of foo as any) {
						if (key in keyUseCount) {
							keyUseCount[key]++;
						} else {
							keyUseCount[key] = 1;
						}
					}

					return keyUseCount;
				},
				{},
			);

			for (let i = 0; i < 80; i++) {
				expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
			}
		});
	});

	describe('#batchGet', () => {
		const promiseFunc = jest.fn(async () =>
			Promise.resolve<BatchGetItemOutput>({
				UnprocessedKeys: {},
			}),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		mockDynamoDbClient.on(BatchGetItemCommand).callsFake(promiseFunc);

		beforeEach(() => {
			promiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
			//   MockDynamoDbClient.batchGetItem.mockClear();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class Item {
			public buzz?: boolean;
			public pop?: string;

			constructor(public fizz: number) {}

			get [DynamoDbTable](): string {
				return 'foo';
			}

			get [DynamoDbSchema](): Schema {
				return {
					fizz: {
						type: 'Number',
						keyType: 'HASH',
					},
					buzz: {type: 'Boolean'},
					pop: {type: 'String'},
				};
			}
		}

		it('should allow setting an overall read consistency', async () => {
			const gets = [new Item(0)];

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of mapper.batchGet(gets, {
				readConsistency: 'strong',
			})) {
				// Pass
			}

			expect(
				mockDynamoDbClient
					.commandCalls(BatchGetItemCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					RequestItems: {
						foo: {
							Keys: [{fizz: {N: '0'}}],
							ConsistentRead: true,
						},
					},
				},
			]);
		});

		it('should allow setting per-table read consistency', async () => {
			const gets = [
				new Item(0),
				{
					quux: 1,
					[DynamoDbTable]: 'bar',
					[DynamoDbSchema]: {
						quux: {
							type: 'Number',
							keyType: 'HASH',
						},
					},
				},
			];
			const config: BatchGetOptions = {
				readConsistency: 'eventual',
				perTableOptions: {
					bar: {
						readConsistency: 'strong',
					},
				},
			};

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of mapper.batchGet(gets, config)) {
				// Pass
			}

			expect(
				mockDynamoDbClient
					.commandCalls(BatchGetItemCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					RequestItems: {
						foo: {
							Keys: [{fizz: {N: '0'}}],
						},
						bar: {
							Keys: [{quux: {N: '1'}}],
							ConsistentRead: true,
						},
					},
				},
			]);
		});

		it('should allow specifying per-table projection expressions', async () => {
			const gets = [
				new Item(0),
				{
					quux: 1,
					[DynamoDbTable]: 'bar',
					[DynamoDbSchema]: {
						quux: {
							type: 'Number',
							keyType: 'HASH',
						},
						snap: {
							type: 'Document',
							attributeName: 'crackle',
							members: {
								pop: {
									type: 'String',
									attributeName: 'squark',
								},
							},
						},
						mixedList: {
							type: 'Collection',
							attributeName: 'myList',
						},
					},
				},
			];
			const config: BatchGetOptions = {
				perTableOptions: {
					bar: {
						projection: ['snap.pop', 'mixedList[2]'],
					},
				},
			};

			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			for await (const _ of mapper.batchGet(gets, config)) {
				// Pass
			}

			expect(
				mockDynamoDbClient
					.commandCalls(BatchGetItemCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					RequestItems: {
						foo: {
							Keys: [{fizz: {N: '0'}}],
						},
						bar: {
							Keys: [{quux: {N: '1'}}],
							ProjectionExpression: '#attr0.#attr1, #attr2[2]',
							ExpressionAttributeNames: {
								'#attr0': 'crackle',
								'#attr1': 'squark',
								'#attr2': 'myList',
							},
						},
					},
				},
			]);
		});

		describe.each([true, false])('should', asyncInput => {
			// For (const asyncInput of [true, false]) {
			it('partition get batches into requests with 100 or fewer items', async () => {
				const gets: Item[] = [];
				const expected: BatchGetItemInput[] = [
					{RequestItems: {foo: {Keys: []}}},
					{RequestItems: {foo: {Keys: []}}},
					{RequestItems: {foo: {Keys: []}}},
					{RequestItems: {foo: {Keys: []}}},
				];
				const responses: BatchGetItemOutput[] = [
					{Responses: {foo: []}},
					{Responses: {foo: []}},
					{Responses: {foo: []}},
					{Responses: {foo: []}},
				];

				for (let i = 0; i < 325; i++) {
					gets.push(new Item(i));
					responses[Math.floor(i / 100)].Responses?.foo.push({
						fizz: {N: String(i)},
						buzz: {BOOL: i % 2 === 0},
						pop: {S: 'Goes the weasel'},
					});
					expected[Math.floor(i / 100)].RequestItems?.foo.Keys?.push(
						{
							fizz: {N: String(i)},
						},
					);
				}

				for (const response of responses) {
					promiseFunc.mockImplementationOnce(async () =>
						Promise.resolve(response),
					);
				}

				const input = asyncInput
					? (async function * () {
						for (const item of gets) {
							await new Promise(resolve =>
								setTimeout(resolve, Math.round(Math.random())),
							);
							yield item;
						}
					})()
					: gets;

				for await (const item of mapper.batchGet(input)) {
					expect(item).toBeInstanceOf(Item);
					expect(item.buzz).toBe(item.fizz % 2 === 0);
					expect(item.pop).toBe('Goes the weasel');
				}

				const calls
                    = mockDynamoDbClient.commandCalls(BatchGetItemCommand);
				expect(calls).toHaveLength(4);
				// Expect(calls).toEqual(expected);
			});

			it('retry unprocessed items', async () => {
				const failures = new Set(['24', '142', '260']);

				const gets: Item[] = [];
				const expected: BatchGetItemInput[] = [
					{RequestItems: {foo: {Keys: []}}},
					{RequestItems: {foo: {Keys: []}}},
					{RequestItems: {foo: {Keys: []}}},
					{RequestItems: {foo: {Keys: []}}},
				];
				const responses: BatchGetItemOutput[] = [
					{
						Responses: {foo: []},
						UnprocessedKeys: {foo: {Keys: []}},
					},
					{
						Responses: {foo: []},
						UnprocessedKeys: {foo: {Keys: []}},
					},
					{
						Responses: {foo: []},
						UnprocessedKeys: {foo: {Keys: []}},
					},
					{
						Responses: {foo: []},
						UnprocessedKeys: {foo: {Keys: []}},
					},
				];

				let currentRequest = 0;
				for (let i = 0; i < 325; i++) {
					gets.push(new Item(i));
					expected[currentRequest].RequestItems?.foo.Keys?.push({
						fizz: {N: String(i)},
					});

					const response = {
						fizz: {N: String(i)},
						buzz: {BOOL: i % 2 === 0},
						pop: {S: 'Goes the weasel'},
					};

					if (failures.has(String(i))) {
						responses[currentRequest].UnprocessedKeys?.foo.Keys?.push(
							{
								fizz: {N: String(i)},
							},
						);
						responses[currentRequest + 1].Responses?.foo.push(
							response,
						);
					} else {
						responses[currentRequest].Responses?.foo.push(response);
						if (
							responses[currentRequest].Responses?.foo.length
                            === 99
						) {
							currentRequest++;
						}
					}
				}

				for (const response of responses) {
					promiseFunc.mockImplementationOnce(async () =>
						Promise.resolve(response),
					);
				}

				const input = asyncInput
					? (async function * () {
						for (const item of gets) {
							await new Promise(resolve =>
								setTimeout(resolve, Math.round(Math.random())),
							);
							yield item;
						}
					})()
					: gets;

				let itemsReturned = 0;
				for await (const item of mapper.batchGet(input)) {
					expect(item).toBeInstanceOf(Item);
					expect(item.buzz).toBe(item.fizz % 2 === 0);
					expect(item.pop).toBe('Goes the weasel');
					itemsReturned++;
				}

				expect(itemsReturned).toBe(325);

				// Const { calls } = mockDynamoDbClient.batchGetItem.mock;
				const calls
                    = mockDynamoDbClient.commandCalls(BatchGetItemCommand);
				const callCount = calls
					.map(({args: [{input}]}) => input)
					.reduce<Record<string, number>>(
					(
						keyUseCount,
						{
							RequestItems: {foo} = {
								foo: undefined,
							},
						},
					) => {
						for (const {
							fizz: {N: key},
						} of foo?.Keys as any) {
							if (key in keyUseCount) {
								keyUseCount[key]++;
							} else {
								keyUseCount[key] = 1;
							}
						}

						return keyUseCount;
					},
					{},
				);

				for (let i = 0; i < 325; i++) {
					expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
				}
			});
			// }
		});
	});

	describe('#batchPut', () => {
		const promiseFunc = jest.fn(async () =>
			Promise.resolve({
				UnprocessedItems: {},
			}),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		mockDynamoDbClient.on(BatchWriteItemCommand).callsFake(promiseFunc);

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		let counter = 0;
		class Item {
			fizz?: number;

			buzz?: Set<string>;

			get [DynamoDbTable](): string {
				return 'foo';
			}

			get [DynamoDbSchema](): Schema {
				return {
					fizz: {
						type: 'Number',
						keyType: 'HASH',
						defaultProvider() {
							return counter++;
						},
					},
					buzz: {
						type: 'Set',
						memberType: 'String',
					},
				};
			}
		}

		beforeEach(() => {
			counter = 0;
			promiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
		});

		describe.each([true, false])('should', asyncInput => {
			it('partition put batches into requests with 25 or fewer items', async () => {
				const puts: Item[] = [];
				const expected: BatchWriteItemInput[] = [
					{RequestItems: {foo: []}},
					{RequestItems: {foo: []}},
					{RequestItems: {foo: []}},
					{RequestItems: {foo: []}},
				];
				for (let i = 0; i < 80; i++) {
					puts.push(new Item());
					expected[Math.floor(i / 25)].RequestItems?.foo.push({
						PutRequest: {
							Item: {
								fizz: {N: String(i)},
							},
						},
					});
				}

				const input = asyncInput
					? (async function * () {
						for (const item of puts) {
							await new Promise(resolve =>
								setTimeout(resolve, Math.round(Math.random())),
							);
							yield item;
						}
					})()
					: puts;

				for await (const item of mapper.batchPut(input)) {
					expect(item).toBeInstanceOf(Item);
					expect(typeof item.fizz).toBe('number');
				}

				//   Const { calls } = mockDynamoDbClient.batchWriteItem.mock;
				const calls = mockDynamoDbClient.commandCalls(
					BatchWriteItemCommand,
				);
				expect(calls.length).toBe(4);
				expect(calls.map(call => [call.args[0].input])).toEqual(
					expected,
				);
			});

			it('retry unprocessed items', async () => {
				const puts: Item[] = [];
				for (let i = 0; i < 80; i++) {
					const item = new Item();
					item.buzz = new Set<string>(['foo', 'bar', 'baz']);
					puts.push(item);
				}

				const failures = new Set(['24', '42', '60']);
				for (const failureId of failures) {
					const item = {
						PutRequest: {
							Item: {
								fizz: {N: failureId},
								buzz: {SS: ['foo', 'bar', 'baz']},
							},
						},
					};
					promiseFunc.mockImplementationOnce(async () =>
						Promise.resolve({
							UnprocessedItems: {foo: [item]},
						}),
					);
				}

				const input = asyncInput
					? (async function * () {
						for (const item of puts) {
							await new Promise(resolve =>
								setTimeout(resolve, Math.round(Math.random())),
							);
							yield item;
						}
					})()
					: puts;

				for await (const item of mapper.batchPut(input)) {
					expect(item).toBeInstanceOf(Item);
					expect(typeof item.fizz).toBe('number');
					expect(item.buzz).toBeInstanceOf(Set);
				}

				const calls = mockDynamoDbClient.commandCalls(
					BatchWriteItemCommand,
				);
				expect(calls.length).toBe(4);
				const callCount = calls
					.map(call => call.args[0].input)
					.reduce<Record<string, number>>(
					(
						keyUseCount,
						{RequestItems: {foo} = {foo: undefined}},
					) => {
						for (const {
							PutRequest: {
								Item: {
									fizz: {N: key},
								},
							},
						} of foo as any) {
							if (key in keyUseCount) {
								keyUseCount[key]++;
							} else {
								keyUseCount[key] = 1;
							}
						}

						return keyUseCount;
					},
					{},
				);

				for (let i = 0; i < 80; i++) {
					expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
				}
			});
		});
	});

	describe('#createGlobalSecondaryIndex', () => {
		const describeTablePromiseFunc = jest.fn(async () =>
			Promise.resolve({
				Table: {TableStatus: 'ACTIVE'},
			}),
		);
		const updateTablePromiseFunc = jest.fn(async () => Promise.resolve({}));

		const mockDynamoDbClient = mockClient(DynamoDBClient);
		mockDynamoDbClient
			.on(UpdateTableCommand)
			.callsFake(updateTablePromiseFunc)
			.on(DescribeTableCommand)
			.callsFake(describeTablePromiseFunc);

		// MockDynamoDbClient.on(WaitForCommand).callsFake(updateTablePromiseFunc);

		beforeEach(() => {
			describeTablePromiseFunc.mockClear();
			updateTablePromiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
			// MockDynamoDbClient.updateTable.mockClear();
			// waitPromiseFunc.mockClear();
			// mockDynamoDbClient.waitFor.mockClear();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class Item {
			get [DynamoDbTable]() {
				return 'foo';
			}

			get [DynamoDbSchema]() {
				return {
					id: {
						type: 'String',
						keyType: 'HASH',
					},
					description: {
						type: 'String',
						indexKeyConfigurations: {
							DescriptionIndex: 'HASH',
						},
					},
				};
			}
		}

		const DescriptionIndex: GlobalSecondaryIndexOptions = {
			projection: 'all',
			readCapacityUnits: 1,
			type: 'global',
			writeCapacityUnits: 1,
		};

		it('should make and send an UpdateTable request', async () => {
			await mapper.createGlobalSecondaryIndex(Item, 'DescriptionIndex', {
				indexOptions: {
					DescriptionIndex,
				},
				readCapacityUnits: 5,
				writeCapacityUnits: 5,
			});

			expect(
				mockDynamoDbClient
					.commandCalls(UpdateTableCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					TableName: 'foo',
					AttributeDefinitions: [
						{
							AttributeName: 'id',
							AttributeType: 'S',
						},
						{
							AttributeName: 'description',
							AttributeType: 'S',
						},
					],
					GlobalSecondaryIndexUpdates: [
						{
							Create: {
								IndexName: 'DescriptionIndex',
								KeySchema: [
									{
										AttributeName: 'description',
										KeyType: 'HASH',
									},
								],
								Projection: {
									ProjectionType: 'ALL',
								},
								ProvisionedThroughput: {
									ReadCapacityUnits: 1,
									WriteCapacityUnits: 1,
								},
							},
						},
					],
				},
			]);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand),
			).toHaveLength(1);

			// Expect(mockDynamoDbClient.waitFor.mock.calls).toEqual([
			//   ["tableExists", { TableName: "foo" }],
			// ]);
		});
	});

	describe('#createTable', () => {
		const createTablePromiseFunc = jest.fn(async () => Promise.resolve({}));
		const describeTablePromiseFunc = jest.fn(async () =>
			Promise.resolve({
				Table: {TableStatus: 'ACTIVE'},
			}),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		mockDynamoDbClient
			.on(CreateTableCommand)
			.callsFake(createTablePromiseFunc)
			.on(DescribeTableCommand)
			.callsFake(describeTablePromiseFunc);

		beforeEach(() => {
			createTablePromiseFunc.mockClear();
			describeTablePromiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class Item {
			get [DynamoDbTable]() {
				return 'foo';
			}

			get [DynamoDbSchema]() {
				return {id: {type: 'String', keyType: 'HASH'}};
			}
		}

		it('should make and send a CreateTable request', async () => {
			await mapper.createTable(Item, {
				readCapacityUnits: 5,
				writeCapacityUnits: 5,
			});

			expect(
				mockDynamoDbClient
					.commandCalls(CreateTableCommand)
					.map(call => call.args[0].input),
			).toEqual(
				// [
				[
					{
						TableName: 'foo',
						AttributeDefinitions: [
							{
								AttributeName: 'id',
								AttributeType: 'S',
							},
						],
						KeySchema: [
							{
								AttributeName: 'id',
								KeyType: 'HASH',
							},
						],
						ProvisionedThroughput: {
							ReadCapacityUnits: 5,
							WriteCapacityUnits: 5,
						},
						StreamSpecification: {StreamEnabled: false},
						SSESpecification: {Enabled: false},
					},
				],
				// ]
			);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand),
			).toHaveLength(1);
			// Expect(mockDynamoDbClient.waitFor.mock.calls).toEqual([
			//     ['tableExists', { TableName: 'foo' }],
			// ]);
		});

		it('should forgo invoking the waiter if the table is already active', async () => {
			createTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					TableDescription: {TableStatus: 'ACTIVE'},
				}),
			);

			await mapper.createTable(Item, {
				readCapacityUnits: 5,
				writeCapacityUnits: 5,
			});

			expect(
				mockDynamoDbClient.commandCalls(CreateTableCommand).length,
			).toBe(1);

			// Expect(mockDynamoDbClient.waitFor.mock.calls.length).toBe(0);
			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand),
			).toHaveLength(0);
		});

		it('should allow enabling streams', async () => {
			await mapper.createTable(Item, {
				readCapacityUnits: 5,
				streamViewType: 'NEW_AND_OLD_IMAGES',
				writeCapacityUnits: 5,
			});

			expect(
				mockDynamoDbClient
					.commandCalls(CreateTableCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					TableName: 'foo',
					AttributeDefinitions: [
						{
							AttributeName: 'id',
							AttributeType: 'S',
						},
					],
					KeySchema: [
						{
							AttributeName: 'id',
							KeyType: 'HASH',
						},
					],
					ProvisionedThroughput: {
						ReadCapacityUnits: 5,
						WriteCapacityUnits: 5,
					},
					StreamSpecification: {
						StreamEnabled: true,
						StreamViewType: 'NEW_AND_OLD_IMAGES',
					},
					SSESpecification: {Enabled: false},
				},
			]);
		});

		it('should create new table with on-demand capacity mode', async () => {
			await mapper.createTable(Item, {
				billingMode: 'PAY_PER_REQUEST',
			});

			expect(
				mockDynamoDbClient
					.commandCalls(CreateTableCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					TableName: 'foo',
					AttributeDefinitions: [
						{
							AttributeName: 'id',
							AttributeType: 'S',
						},
					],
					KeySchema: [
						{
							AttributeName: 'id',
							KeyType: 'HASH',
						},
					],
					BillingMode: 'PAY_PER_REQUEST',
					StreamSpecification: {StreamEnabled: false},
					SSESpecification: {Enabled: false},
				},
			]);
		});

		it('should allow enabling sse using AWS managed CMK', async () => {
			await mapper.createTable(Item, {
				readCapacityUnits: 5,
				writeCapacityUnits: 5,
				sseSpecification: {
					sseType: 'KMS',
				},
			});

			expect(
				mockDynamoDbClient
					.commandCalls(CreateTableCommand)
					.map(call => call.args[0].input),
			).toEqual([
				{
					TableName: 'foo',
					AttributeDefinitions: [
						{
							AttributeName: 'id',
							AttributeType: 'S',
						},
					],
					KeySchema: [
						{
							AttributeName: 'id',
							KeyType: 'HASH',
						},
					],
					ProvisionedThroughput: {
						ReadCapacityUnits: 5,
						WriteCapacityUnits: 5,
					},
					StreamSpecification: {StreamEnabled: false},
					SSESpecification: {
						Enabled: true,
						SSEType: 'KMS',
					},
				},
			]);
		});

		describe('index keys', () => {
			class IndexedItem {
				get [DynamoDbTable]() {
					return 'foo';
				}

				get [DynamoDbSchema]() {
					return {
						partitionKey: {
							type: 'Number',
							keyType: 'HASH',
						},
						createdAt: {
							type: 'Date',
							keyType: 'RANGE',
							indexKeyConfigurations: {
								chronological: 'HASH',
								globalIndex: 'RANGE',
							},
							attributeName: 'timestamp',
						},
						createdBy: {
							type: 'String',
							indexKeyConfigurations: {
								globalIndex: 'HASH',
								localIndex: 'RANGE',
							},
							attributeName: 'creator',
						},
						binaryKey: {
							type: 'Binary',
							indexKeyConfigurations: {
								binaryIndex: 'HASH',
							},
						},
						customKey: {
							type: 'Custom',
							attributeType: 'S',
							marshall: (string_: string) => string_,
							unmarshall: (av: {S: string}) => av.S,
							indexKeyConfigurations: {
								binaryIndex: 'RANGE',
							},
						},
						listProp: {type: 'Collection'},
					};
				}
			}

			it('should identify and report index keys', async () => {
				await mapper.createTable(IndexedItem, {
					readCapacityUnits: 5,
					writeCapacityUnits: 5,
					indexOptions: {
						binaryIndex: {
							type: 'global',
							readCapacityUnits: 2,
							writeCapacityUnits: 3,
							projection: ['createdBy', 'createdAt'],
						},
						chronological: {
							type: 'global',
							readCapacityUnits: 5,
							writeCapacityUnits: 5,
							projection: 'all',
						},
						globalIndex: {
							type: 'global',
							readCapacityUnits: 6,
							writeCapacityUnits: 7,
							projection: 'all',
						},
						localIndex: {
							type: 'local',
							projection: 'keys',
						},
					},
				});

				expect(
					mockDynamoDbClient
						.commandCalls(CreateTableCommand)
						.map(call => call.args[0].input),
				).toEqual([
					{
						AttributeDefinitions: [
							{
								AttributeName: 'partitionKey',
								AttributeType: 'N',
							},
							{
								AttributeName: 'timestamp',
								AttributeType: 'N',
							},
							{
								AttributeName: 'creator',
								AttributeType: 'S',
							},
							{
								AttributeName: 'binaryKey',
								AttributeType: 'B',
							},
							{
								AttributeName: 'customKey',
								AttributeType: 'S',
							},
						],
						GlobalSecondaryIndexes: [
							{
								IndexName: 'chronological',
								KeySchema: [
									{
										AttributeName: 'timestamp',
										KeyType: 'HASH',
									},
								],
								Projection: {ProjectionType: 'ALL'},
								ProvisionedThroughput: {
									ReadCapacityUnits: 5,
									WriteCapacityUnits: 5,
								},
							},
							{
								IndexName: 'globalIndex',
								KeySchema: [
									{
										AttributeName: 'creator',
										KeyType: 'HASH',
									},
									{
										AttributeName: 'timestamp',
										KeyType: 'RANGE',
									},
								],
								Projection: {ProjectionType: 'ALL'},
								ProvisionedThroughput: {
									ReadCapacityUnits: 6,
									WriteCapacityUnits: 7,
								},
							},
							{
								IndexName: 'binaryIndex',
								KeySchema: [
									{
										AttributeName: 'binaryKey',
										KeyType: 'HASH',
									},
									{
										AttributeName: 'customKey',
										KeyType: 'RANGE',
									},
								],
								Projection: {
									ProjectionType: 'INCLUDE',
									NonKeyAttributes: ['creator', 'timestamp'],
								},
								ProvisionedThroughput: {
									ReadCapacityUnits: 2,
									WriteCapacityUnits: 3,
								},
							},
						],
						KeySchema: [
							{
								AttributeName: 'partitionKey',
								KeyType: 'HASH',
							},
							{
								AttributeName: 'timestamp',
								KeyType: 'RANGE',
							},
						],
						LocalSecondaryIndexes: [
							{
								IndexName: 'localIndex',
								KeySchema: [
									{
										AttributeName: 'creator',
										KeyType: 'RANGE',
									},
								],
								Projection: {
									ProjectionType: 'KEYS_ONLY',
								},
							},
						],
						ProvisionedThroughput: {
							ReadCapacityUnits: 5,
							WriteCapacityUnits: 5,
						},
						StreamSpecification: {StreamEnabled: false},
						SSESpecification: {Enabled: false},
						TableName: 'foo',
					},
				]);
			});

			it('should identify and report index keys with on-demand capacity mode', async () => {
				await mapper.createTable(IndexedItem, {
					billingMode: 'PAY_PER_REQUEST',
					indexOptions: {
						binaryIndex: {
							type: 'global',
							projection: ['createdBy', 'createdAt'],
						},
						chronological: {
							type: 'global',
							projection: 'all',
						},
						globalIndex: {
							type: 'global',
							projection: 'all',
						},
						localIndex: {
							type: 'local',
							projection: 'keys',
						},
					},
				});

				expect(
					mockDynamoDbClient
						.commandCalls(CreateTableCommand)
						.map(call => call.args[0].input),
				).toEqual([
					{
						AttributeDefinitions: [
							{
								AttributeName: 'partitionKey',
								AttributeType: 'N',
							},
							{
								AttributeName: 'timestamp',
								AttributeType: 'N',
							},
							{
								AttributeName: 'creator',
								AttributeType: 'S',
							},
							{
								AttributeName: 'binaryKey',
								AttributeType: 'B',
							},
							{
								AttributeName: 'customKey',
								AttributeType: 'S',
							},
						],
						GlobalSecondaryIndexes: [
							{
								IndexName: 'chronological',
								KeySchema: [
									{
										AttributeName: 'timestamp',
										KeyType: 'HASH',
									},
								],
								Projection: {ProjectionType: 'ALL'},
							},
							{
								IndexName: 'globalIndex',
								KeySchema: [
									{
										AttributeName: 'creator',
										KeyType: 'HASH',
									},
									{
										AttributeName: 'timestamp',
										KeyType: 'RANGE',
									},
								],
								Projection: {ProjectionType: 'ALL'},
							},
							{
								IndexName: 'binaryIndex',
								KeySchema: [
									{
										AttributeName: 'binaryKey',
										KeyType: 'HASH',
									},
									{
										AttributeName: 'customKey',
										KeyType: 'RANGE',
									},
								],
								Projection: {
									ProjectionType: 'INCLUDE',
									NonKeyAttributes: ['creator', 'timestamp'],
								},
							},
						],
						KeySchema: [
							{
								AttributeName: 'partitionKey',
								KeyType: 'HASH',
							},
							{
								AttributeName: 'timestamp',
								KeyType: 'RANGE',
							},
						],
						LocalSecondaryIndexes: [
							{
								IndexName: 'localIndex',
								KeySchema: [
									{
										AttributeName: 'creator',
										KeyType: 'RANGE',
									},
								],
								Projection: {
									ProjectionType: 'KEYS_ONLY',
								},
							},
						],
						BillingMode: 'PAY_PER_REQUEST',
						StreamSpecification: {StreamEnabled: false},
						SSESpecification: {Enabled: false},
						TableName: 'foo',
					},
				]);
			});

			it('should throw if no options were provided for a modeled index', async () => {
				const options = {
					readCapacityUnits: 5,
					writeCapacityUnits: 5,
				};

				await expect(
					mapper.createTable(IndexedItem, options),
				).rejects.toMatchObject(
					new Error('No options provided for chronological index'),
				);
			});
		});
	});

	describe('#delete', () => {
		const promiseFunc = jest.fn(async () =>
			Promise.resolve({Attributes: {}}),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		mockDynamoDbClient.on(DeleteItemCommand).callsFake(promiseFunc);

		beforeEach(() => {
			promiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		it('should throw if the item does not provide a schema per the data mapper protocol', async () => {
			await expect(
				mapper.delete({
					[DynamoDbTable]: 'foo',
				}),
			).rejects.toMatchObject(
				new Error(
					'The provided item did not adhere to the DynamoDbDocument protocol. No object property was found at the `DynamoDbSchema` symbol',
				),
			);
		});

		it('should throw if the item does not provide a table name per the data mapper protocol', async () => {
			await expect(
				mapper.delete({
					[DynamoDbSchema]: {},
				}),
			).rejects.toMatchObject(
				new Error(
					'The provided item did not adhere to the DynamoDbTable protocol. No string property was found at the `DynamoDbTable` symbol',
				),
			);
		});

		it('should use the table name specified in the supplied table definition', async () => {
			const tableName = 'foo';
			await mapper.delete({
				[DynamoDbTable]: tableName,
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({TableName: tableName});
		});

		it('should apply a table name prefix provided to the mapper constructor', async () => {
			const tableNamePrefix = 'INTEG_';
			const mapper = new DataMapper({
				client: mockDynamoDbClient as unknown as DynamoDBClient,
				tableNamePrefix,
			});
			const tableName = 'foo';
			await mapper.delete({
				[DynamoDbTable]: tableName,
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({TableName: tableNamePrefix + tableName});
		});

		it('should marshall the supplied key according to the schema', async () => {
			await mapper.delete({
				fizz: 'buzz',
				pop: new Date(60_000),
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
						keyType: 'RANGE',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({
				Key: {
					fizz: {S: 'buzz'},
					pop: {N: '60'},
				},
			});
		});

		it('should ignore non-key fields when marshalling the key', async () => {
			await mapper.delete({
				fizz: 'buzz',
				pop: new Date(60_000),
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({
				Key: {fizz: {S: 'buzz'}},
			});
		});

		it('should apply attribute names when marshalling the key', async () => {
			await mapper.delete({
				fizz: 'buzz',
				pop: new Date(60_000),
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({
				Key: {foo: {S: 'buzz'}},
			});
		});

		it('should include a condition expression when the schema contains a version attribute', async () => {
			await mapper.delete({
				fizz: 'buzz',
				pop: 21,
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({
				ConditionExpression: '#attr0 = :val1',
				ExpressionAttributeNames: {'#attr0': 'pop'},
				ExpressionAttributeValues: {':val1': 21},
			});
		});

		it('should not include a condition expression when the schema contains a version attribute but the value is undefined', async () => {
			await mapper.delete({
				fizz: 'buzz',
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).not.toHaveProperty('ConditionExpression');
		});

		it('should not include a condition expression when the skipVersionCheck input parameter is true', async () => {
			await mapper.delete(
				{
					fizz: 'buzz',
					pop: 21,
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
					},
				},
				{skipVersionCheck: true},
			);

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).not.toHaveProperty('ConditionExpression');
		});

		it('should not include a condition expression when the mapper\'s default skipVersionCheck input parameter is true', async () => {
			const mapper = new DataMapper({
				client: mockDynamoDbClient as unknown as DynamoDBClient,
				skipVersionCheck: true,
			});
			await mapper.delete({
				fizz: 'buzz',
				pop: 21,
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).not.toHaveProperty('ConditionExpression');
		});

		it('should combine the version condition with any other condition expression', async () => {
			await mapper.delete(
				{
					fizz: 'buzz',
					pop: 21,
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
						quux: {type: 'Date'},
					},
				},
				{
					condition: {
						type: 'LessThan',
						subject: 'quux',
						object: 600_000,
					},
				},
			);

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toMatchObject({
				ConditionExpression: '(#attr0 < :val1) AND (#attr2 = :val3)',
				ExpressionAttributeNames: {
					'#attr0': 'quux',
					'#attr2': 'pop',
				},
				ExpressionAttributeValues: {
					':val1': 600_000,
					':val3': 21,
				},
			});
		});

		it('should not include ExpressionAttributeValues when a substitution has not been made', async () => {
			await mapper.delete(
				{
					fizz: 'buzz',
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'bar',
							keyType: 'HASH',
						},
					},
				},
				{
					condition: new FunctionExpression(
						'attribute_not_exists',
						new AttributePath('fizz'),
					),
				},
			);

			expect(
				mockDynamoDbClient.commandCalls(DeleteItemCommand)[0].args[0]
					.input,
			).toEqual({
				ConditionExpression: 'attribute_not_exists(#attr0)',
				ExpressionAttributeNames: {
					'#attr0': 'bar',
				},
				TableName: 'foo',
				Key: {
					bar: {S: 'buzz'},
				},
				ReturnValues: 'ALL_OLD',
			});
		});

		it('should unmarshall any returned attributes', async () => {
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({
					Attributes: {
						fizz: {S: 'buzz'},
						bar: {NS: ['1', '2', '3']},
						baz: {L: [{BOOL: true}, {N: '4'}]},
					},
				}),
			);

			const result = await mapper.delete(
				{
					foo: 'buzz',
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						foo: {
							type: 'String',
							attributeName: 'fizz',
							keyType: 'HASH',
						},
						bar: {
							type: 'Set',
							memberType: 'Number',
						},
						baz: {
							type: 'Tuple',
							members: [{type: 'Boolean'}, {type: 'Number'}],
						},
					},
				},
				{returnValues: 'ALL_OLD'},
			);

			expect(result).toEqual({
				foo: 'buzz',
				bar: new Set([1, 2, 3]),
				baz: [true, 4],
			});
		});

		it('should support the legacy call pattern', async () => {
			await mapper.delete({
				item: {
					fizz: 'buzz',
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
					},
				},
			});
		});

		it('should return instances of the correct class', async () => {
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({
					Attributes: {
						fizz: {S: 'buzz'},
						bar: {NS: ['1', '2', '3']},
						baz: {L: [{BOOL: true}, {N: '4'}]},
					},
				}),
			);

			class Item {
				foo?: string;

				constructor(foo?: string) {
					this.foo = foo;
				}

				get [DynamoDbTable]() {
					return 'foo';
				}

				get [DynamoDbSchema]() {
					return {
						foo: {
							type: 'String',
							attributeName: 'fizz',
							keyType: 'HASH',
						},
						bar: {
							type: 'Set',
							memberType: 'Number',
						},
						baz: {
							type: 'Tuple',
							members: [{type: 'Boolean'}, {type: 'Number'}],
						},
					};
				}
			}

			const result = await mapper.delete(new Item('buzz'), {
				returnValues: 'ALL_OLD',
			});

			expect(result).toEqual({
				foo: 'buzz',
				bar: new Set([1, 2, 3]),
				baz: [true, 4],
			});
		});
	});

	describe('#deleteTable', () => {
		const deleteTablePromiseFunc = jest.fn(async () => Promise.resolve({}));
		const describeTablePromiseFunc = jest.fn(async () =>
			Promise.resolve({}),
		);

		const mockDynamoDbClient = mockClient(DynamoDBClient)
			.on(DeleteTableCommand)
			.callsFake(deleteTablePromiseFunc)
			.on(DescribeTableCommand)
			.callsFake(describeTablePromiseFunc);

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		beforeEach(() => {
			mockDynamoDbClient.resetHistory();
			deleteTablePromiseFunc.mockClear();
			describeTablePromiseFunc.mockClear();
		});

		class Item {
			get [DynamoDbTable]() {
				return 'foo';
			}

			get [DynamoDbSchema]() {
				return {id: {type: 'String', keyType: 'HASH'}};
			}
		}

		it('should make and send a DeleteTable request and wait for it to take effect', async () => {
			// DescribeTablePromiseFunc.mockImplementationOnce(async () =>
			//     Promise.resolve({
			//         Table: { TableStatus: 'DELETING' },
			//     })
			// );
			describeTablePromiseFunc.mockImplementationOnce(async () => {
				const error = new Error('No such table!');
				error.name = 'ResourceNotFoundException';
				throw error;
			});

			await mapper.deleteTable(Item);

			expect(
				mockDynamoDbClient.commandCalls(DeleteTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: 'foo'});

			// Expect(mockDynamoDbClient.waitFor.mock.calls).toEqual([
			//     ['tableNotExists', { TableName: 'foo' }],
			// ]);
		});
	});

	describe('#ensureGlobalSecondaryIndexExists', () => {
		const describeTablePromiseFunc = jest.fn(async () =>
			Promise.resolve({
				Table: {
					TableStatus: 'ACTIVE',
					GlobalSecondaryIndexes: [
						{
							IndexName: 'DescriptionIndex',
						},
					],
				},
			} as DescribeTableOutput),
		);

		const mockDynamoDbClient = mockClient(DynamoDBClient)
			.on(DescribeTableCommand)
			.callsFake(describeTablePromiseFunc);

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});
		mapper.createGlobalSecondaryIndex = jest.fn(async () =>
			Promise.resolve(),
		);

		beforeEach(() => {
			(mapper.createGlobalSecondaryIndex as jest.Mock).mockClear();
			mockDynamoDbClient.resetHistory();
		});

		const tableName = 'foo';
		const schema = {
			id: {
				type: 'String',
				keyType: 'HASH',
			},
			description: {
				type: 'String',
				indexKeyConfigurations: {
					DescriptionIndex: 'HASH',
				},
			},
		};

		class Item {
			get [DynamoDbTable]() {
				return tableName;
			}

			get [DynamoDbSchema]() {
				return schema;
			}
		}

		const DescriptionIndex: GlobalSecondaryIndexOptions = {
			projection: 'all',
			readCapacityUnits: 1,
			type: 'global',
			writeCapacityUnits: 1,
		};

		it('should resolve immediately if the table exists, is active, and the GSI already exists', async () => {
			await mapper.ensureGlobalSecondaryIndexExists(
				Item,
				'DescriptionIndex',
				{
					indexOptions: {
						DescriptionIndex,
					},
					readCapacityUnits: 5,
					writeCapacityUnits: 5,
				},
			);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			expect(
				(mapper.createGlobalSecondaryIndex as any).mock.calls.length,
			).toBe(0);
		});

		it('should attempt to create the index if the table exists in the ACTIVE state but the specified index does not exist', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'ACTIVE'},
				} as DescribeTableOutput),
			);
			await mapper.ensureGlobalSecondaryIndexExists(
				Item,
				'DescriptionIndex',
				{
					indexOptions: {
						DescriptionIndex,
					},
					readCapacityUnits: 5,
					writeCapacityUnits: 5,
				},
			);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			expect(
				(mapper.createGlobalSecondaryIndex as any).mock.calls.length,
			).toBe(1);
			// Expect(mockDynamoDbClient.waitFor.mock.calls.length).toBe(0);
		});

		it('should rethrow if "describeTable" throws a "ResourceNotFoundException"', async () => {
			const expectedError = new Error('No such table!');
			expectedError.name = 'ResourceNotFoundException';
			describeTablePromiseFunc.mockImplementationOnce(async () => {
				throw expectedError;
			});

			await expect(
				mapper.ensureGlobalSecondaryIndexExists(
					Item,
					'DescriptionIndex',
					{
						indexOptions: {
							DescriptionIndex,
						},
						readCapacityUnits: 5,
						writeCapacityUnits: 5,
					},
				),
			).rejects.toMatchObject(expectedError);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});
		});
	});

	describe('#ensureTableExists', () => {
		const describeTablePromiseFunc = jest.fn(async () =>
			Promise.resolve({
				Table: {TableStatus: 'ACTIVE'},
			} as DescribeTableOutput),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient)
			.on(DescribeTableCommand)
			.callsFake(describeTablePromiseFunc);

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});
		mapper.createTable = jest.fn(async () => Promise.resolve());

		beforeEach(() => {
			(mapper.createTable as jest.Mock).mockClear();
			mockDynamoDbClient.resetHistory();
			describeTablePromiseFunc.mockClear();
		});

		const tableName = 'foo';
		const schema = {
			id: {type: 'String', keyType: 'HASH'},
		};

		class Item {
			get [DynamoDbTable]() {
				return tableName;
			}

			get [DynamoDbSchema]() {
				return schema;
			}
		}

		it('should resolve immediately if the table exists and is active', async () => {
			await mapper.ensureTableExists(Item, {
				readCapacityUnits: 5,
				writeCapacityUnits: 5,
			});

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			// Expect(mockDynamoDbClient.waitFor.mock.calls.length).toBe(0);
			expect((mapper.createTable as any).mock.calls.length).toBe(0);
		});

		it('should wait for the table to exist if its state is not "ACTIVE"', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'CREATING'},
				}),
			);
			await mapper.ensureTableExists(Item, {
				readCapacityUnits: 5,
				writeCapacityUnits: 5,
			});

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			// Expect(mockDynamoDbClient.waitFor.mock.calls.length).toBe(1);
			expect((mapper.createTable as any).mock.calls.length).toBe(0);
		});

		it('should attempt to create the table if "describeTable" throws a "ResourceNotFoundException"', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () => {
				const error = new Error('No such table!');
				error.name = 'ResourceNotFoundException';
				throw error;
			});

			const options = {readCapacityUnits: 5, writeCapacityUnits: 5};
			await mapper.ensureTableExists(Item, options);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			expect((mapper.createTable as any).mock.calls).toEqual([
				[Item, options],
			]);

			// Expect(mockDynamoDbClient.waitFor.mock.calls.length).toBe(0);
		});

		it('should rethrow any service exception other than "ResourceNotFoundException"', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.reject(new Error('PANIC')),
			);

			const options = {readCapacityUnits: 5, writeCapacityUnits: 5};

			await expect(
				mapper.ensureTableExists(Item, options),
			).rejects.toMatchObject(new Error('PANIC'));

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			expect((mapper.createTable as any).mock.calls.length).toBe(0);
			// Expect(mockDynamoDbClient.waitFor.mock.calls.length).toBe(0);
		});
	});

	describe('#ensureTableNotExists', () => {
		// Const waitPromiseFunc = jest.fn(async () =>
		//     Promise.resolve<WaiterResult>({ state: WaiterState.SUCCESS })
		// );
		const describeTablePromiseFunc = jest.fn(async () =>
			Promise.resolve({}),
		);

		const mockDynamoDbClient = mockClient(DynamoDBClient);
		// Const mockDynamoDbClient = {
		//     config: {},
		//     describeTable: jest.fn(() => ({
		//         promise: describeTablePromiseFunc,
		//     })),
		//     waitFor: jest.fn(() => ({ promise: waitPromiseFunc })),
		// };
		mockDynamoDbClient
			.on(DescribeTableCommand)
			.callsFake(describeTablePromiseFunc);

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});
		mapper.deleteTable = jest.fn(async () => Promise.resolve());

		beforeEach(() => {
			(mapper.deleteTable as jest.Mock).mockClear();
			mockDynamoDbClient.resetHistory();
			describeTablePromiseFunc.mockClear();
			// WaitPromiseFunc.mockClear();
		});

		const tableName = 'foo';
		const schema = {
			id: {type: 'String', keyType: 'HASH'},
		};

		class Item {
			get [DynamoDbTable]() {
				return tableName;
			}

			get [DynamoDbSchema]() {
				return schema;
			}
		}

		it('should resolve immediately if the table does not exist', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () => {
				const error = new Error('No such table!');
				error.name = 'ResourceNotFoundException';
				throw error;
			});

			await mapper.ensureTableNotExists(Item);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			// Expect(waitPromiseFunc).not.toHaveBeenCalled();
			expect((mapper.deleteTable as any).mock.calls.length).toBe(0);
		});

		it('should wait for the table not to exist if its state is "DELETING"', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'DELETING'},
				}),
			);

			describeTablePromiseFunc.mockImplementationOnce(async () => {
				const error = new Error('No such table!');
				error.name = 'ResourceNotFoundException';
				throw error;
			});

			await mapper.ensureTableNotExists(Item);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});
			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand).length,
			).toBe(2);
			// Expect((waitUntilTableNotExists as any).mock.calls).toEqual([
			//     ['tableNotExists', { TableName: tableName }],
			// ]);
			expect((mapper.deleteTable as any).mock.calls.length).toBe(0);
		});

		it('should delete the table if its state is "ACTIVE"', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'ACTIVE'},
				}),
			);
			await mapper.ensureTableNotExists(Item);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			// Expect((waitUntilTableNotExists as any).mock.calls.length).toBe(0);
			expect((mapper.deleteTable as any).mock.calls.length).toBe(1);
		});

		it('should wait for the table to exist if its state is "CREATING", then delete it', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'CREATING'},
				}),
			);

			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'ACTIVE'},
				}),
			);
			await mapper.ensureTableNotExists(Item);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});
			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand),
			).toHaveLength(2);
			// Expect((waitUntilTableNotExists as any).mock.calls).toEqual([
			//     ['tableExists', { TableName: tableName }],
			// ]);
			expect((mapper.deleteTable as any).mock.calls.length).toBe(1);
		});

		it('should wait for the table to exist if its state is "UPDATING", then delete it', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'UPDATING'},
				}),
			);

			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Table: {TableStatus: 'ACTIVE'},
				}),
			);

			await mapper.ensureTableNotExists(Item);

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand),
			).toHaveLength(2);

			// Expect((waitUntilTableNotExists as any).mock.calls).toEqual([
			//     ['tableExists', { TableName: tableName }],
			// ]);
			expect((mapper.deleteTable as any).mock.calls.length).toBe(1);
		});

		it('should rethrow any service exception other than "ResourceNotFoundException"', async () => {
			describeTablePromiseFunc.mockImplementationOnce(async () =>
				Promise.reject(new Error('PANIC')),
			);

			await expect(
				mapper.ensureTableNotExists(Item),
			).rejects.toMatchObject(new Error('PANIC'));

			expect(
				mockDynamoDbClient.commandCalls(DescribeTableCommand)[0].args[0]
					.input,
			).toEqual({TableName: tableName});

			expect((mapper.deleteTable as any).mock.calls.length).toBe(0);
			// Expect((waitUntilTableNotExists as any).mock.calls.length).toBe(0);
		});
	});

	describe('#get', () => {
		const promiseFunc = jest.fn(async () =>
			Promise.resolve({Item: {}} as GetItemOutput),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);
		mockDynamoDbClient.on(GetItemCommand).callsFake(promiseFunc);

		beforeEach(() => {
			promiseFunc.mockClear();
			mockDynamoDbClient.resetHistory();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		it('should throw if the item does not provide a schema per the data mapper protocol', async () => {
			await expect(
				mapper.get({
					[DynamoDbTable]: 'foo',
				}),
			).rejects.toMatchObject(
				new Error(
					'The provided item did not adhere to the DynamoDbDocument protocol. No object property was found at the `DynamoDbSchema` symbol',
				),
			);
		});

		it('should throw if the item does not provide a table name per the data mapper protocol', async () => {
			await expect(
				mapper.get({
					[DynamoDbSchema]: {},
				}),
			).rejects.toMatchObject(
				new Error(
					'The provided item did not adhere to the DynamoDbTable protocol. No string property was found at the `DynamoDbTable` symbol',
				),
			);
		});

		it('should use the table name specified in the supplied table definition', async () => {
			const tableName = 'foo';
			await mapper.get({
				[DynamoDbTable]: tableName,
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({TableName: tableName});
		});

		it('should apply a table name prefix provided to the mapper constructor', async () => {
			const tableNamePrefix = 'INTEG_';
			const mapper = new DataMapper({
				client: mockDynamoDbClient as unknown as DynamoDBClient,
				tableNamePrefix,
			});
			const tableName = 'foo';
			await mapper.get({
				[DynamoDbTable]: tableName,
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({TableName: tableNamePrefix + tableName});
		});

		it('should marshall the supplied key according to the schema', async () => {
			await mapper.get({
				fizz: 'buzz',
				pop: new Date(60_000),
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
						keyType: 'RANGE',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({
				Key: {
					fizz: {S: 'buzz'},
					pop: {N: '60'},
				},
			});
		});

		it('should ignore non-key fields when marshalling the key', async () => {
			await mapper.get({
				fizz: 'buzz',
				pop: new Date(60_000),
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({
				Key: {fizz: {S: 'buzz'}},
			});
		});

		it('should apply attribute names when marshalling the key', async () => {
			await mapper.get({
				fizz: 'buzz',
				pop: new Date(60_000),
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({
				Key: {foo: {S: 'buzz'}},
			});
		});

		it('should request a consistent read if the readConsistency is StronglyConsistent', async () => {
			await mapper.get(
				{
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {},
				},
				{readConsistency: 'strong'},
			);

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({ConsistentRead: true});
		});

		it('should apply the read consistency provided to the mapper constructor if not supplied to the operation', async () => {
			const mapper = new DataMapper({
				client: mockDynamoDbClient as unknown as DynamoDBClient,
				readConsistency: 'strong',
			});
			await mapper.get({
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({ConsistentRead: true});
		});

		it('should serialize a provided projection expression', async () => {
			await mapper.get(
				{
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Date',
						},
					},
				},
				{projection: ['fizz', 'pop']},
			);

			expect(
				mockDynamoDbClient.commandCalls(GetItemCommand)[0].args[0].input,
			).toMatchObject({
				ProjectionExpression: '#attr0, #attr1',
				ExpressionAttributeNames: {
					'#attr0': 'foo',
					'#attr1': 'pop',
				},
			});
		});

		it('should convert an empty (item not found) response into a rejected promise whose rejection includes the request sent to DynamoDB', async () => {
			promiseFunc.mockImplementation(async () => Promise.resolve({}));

			return expect(
				mapper.get(
					{
						fizz: 'buzz',
						pop: new Date(60_000),
						[DynamoDbTable]: 'foo',
						[DynamoDbSchema]: {
							fizz: {
								type: 'String',
								attributeName: 'foo',
								keyType: 'HASH',
							},
							pop: {
								type: 'Date',
							},
						},
					},
					{
						readConsistency: 'strong',
						projection: ['fizz', 'pop'],
					},
				),
			).rejects.toMatchObject(
				new ItemNotFoundException({
					TableName: 'foo',
					Key: {foo: {S: 'buzz'}},
					ConsistentRead: true,
					ProjectionExpression: '#attr0, #attr1',
					ExpressionAttributeNames: {
						'#attr0': 'foo',
						'#attr1': 'pop',
					},
				}),
			);
		});

		it('should unmarshall the response using the table schema', async () => {
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({
					Item: {
						foo: {S: 'buzz'},
						pop: {N: '60'},
					},
				}),
			);

			const result = await mapper.get({
				fizz: 'buzz',
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Date',
					},
				},
			});

			expect(result).toEqual({
				fizz: 'buzz',
				pop: new Date(60_000),
			});
		});

		it('should support the legacy call pattern', async () => {
			await mapper.get({
				item: {
					fizz: 'buzz',
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
					},
				},
			});
		});

		it('should return instances of the correct class', async () => {
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({
					Item: {
						foo: {S: 'buzz'},
						pop: {N: '60'},
					},
				}),
			);

			class Item {
				fizz?: string;

				constructor(fizz?: string) {
					this.fizz = fizz;
				}

				get [DynamoDbTable]() {
					return 'foo';
				}

				get [DynamoDbSchema]() {
					return {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Date',
						},
					};
				}
			}

			const result = await mapper.get(new Item('buzz'));

			expect(result).toEqual({
				fizz: 'buzz',
				pop: new Date(60_000),
			});
			expect(result).toBeInstanceOf(Item);
		});
	});

	describe('#parallelScan', () => {
		const promiseFunc = jest.fn();
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		beforeEach(() => {
			promiseFunc.mockClear();
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({Items: []}),
			);
			mockDynamoDbClient.reset();
			mockDynamoDbClient.on(ScanCommand).callsFake(promiseFunc);
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class ScannableItem {
			foo!: string;

			get [DynamoDbTable]() {
				return 'foo';
			}

			get [DynamoDbSchema]() {
				return {
					foo: {
						type: 'String',
						attributeName: 'fizz',
						keyType: 'HASH',
					},
					bar: {
						type: 'Set',
						memberType: 'Number',
					},
					baz: {
						type: 'Tuple',
						members: [{type: 'Boolean'}, {type: 'Number'}],
					},
				};
			}

			static fromKey(key: string) {
				const target = new ScannableItem();
				target.foo = key;
				return target;
			}
		}

		it('should execute multiple requests in parallel when performing a scan with multiple segments', async () => {
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
										baz: {
											L: [{BOOL: true}, {N: '101'}],
										},
									},
								],
							}),
							50,
						);
					}),
			);

			// Enqueue a number of responses that will resolve synchronously
			for (const key of keys) {
				promiseFunc.mockImplementationOnce(async () =>
					Promise.resolve({
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
					}),
				);
			}

			// Enqueue a final page for this segment
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

			const results = mapper.parallelScan(ScannableItem, segments);

			const result: any[] = [];
			for await (const res of results) {
				result.push(res);
			}

			expect(result).toEqual([
				{
					foo: 'snap',
					bar: new Set([1, 2]),
					baz: [true, 3],
				},
				{
					foo: 'crackle',
					bar: new Set([4, 5]),
					baz: [false, 6],
				},
				{
					foo: 'pop',
					bar: new Set([7, 8]),
					baz: [true, 9],
				},
				{
					foo: 'foo',
					bar: new Set([10, 11]),
					baz: [false, 12],
				},
				{
					foo: 'bar',
					bar: new Set([13, 14]),
					baz: [true, 15],
				},
				{
					foo: 'baz',
					bar: new Set([16, 17]),
					baz: [false, 18],
				},
				{
					foo: 'quux',
					bar: new Set([5, 12, 13]),
					baz: [true, 101],
				},
			]);

			for (const scannedItem of result) {
				expect(scannedItem).toBeInstanceOf(ScannableItem);
			}
		});

		it('should return undefined for lastEvaluatedKey on the paginator', async () => {
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [
						{
							fizz: {S: 'snap'},
							bar: {NS: ['1', '2']},
							baz: {L: [{BOOL: true}, {N: '3'}]},
						},
					],
					LastEvaluatedKey: {fizz: {S: 'snap'}},
				}),
			);
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

			const paginator = mapper.parallelScan(ScannableItem, 2).pages();

			for await (const _ of paginator) {
				expect(paginator.lastEvaluatedKey).toBeUndefined();
			}
		});

		it('should return the current state for all segments', async () => {
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [
						{
							fizz: {S: 'snap'},
							bar: {NS: ['1', '2']},
							baz: {L: [{BOOL: true}, {N: '3'}]},
						},
						{
							fizz: {S: 'crackle'},
							bar: {NS: ['4', '5']},
							baz: {L: [{BOOL: true}, {N: '6'}]},
						},
					],
					LastEvaluatedKey: {fizz: {S: 'pop'}},
				}),
			);
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

			const iterator = mapper.parallelScan(ScannableItem, 2);

			for await (const _ of iterator) {
				expect(iterator.pages().scanState).toMatchObject([
					{
						initialized: true,
						lastEvaluatedKey: ScannableItem.fromKey('pop'),
					},
					{initialized: false},
				]);
				break;
			}
		});

		it('should resume from a provided scanState', async () => {
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));
			promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

			const scanState: ParallelScanState = [
				{initialized: true},
				{initialized: true, lastEvaluatedKey: {foo: 'bar'}},
				{initialized: true, lastEvaluatedKey: {foo: 'baz'}},
			];

			for await (const _ of mapper.parallelScan(ScannableItem, 3, {
				scanState,
			})) {
				// Pass
			}

			expect(
				mockDynamoDbClient
					.commandCalls(ScanCommand)
					.map(({args: [{input}]}) => [input]),
			).toEqual([
				[
					{
						TableName: 'foo',
						ExclusiveStartKey: {fizz: {S: 'bar'}},
						Segment: 1,
						TotalSegments: 3,
					},
				],
				[
					{
						TableName: 'foo',
						ExclusiveStartKey: {fizz: {S: 'baz'}},
						Segment: 2,
						TotalSegments: 3,
					},
				],
			]);
		});

		it.skip('should support the legacy call pattern', async () => {
			const iter = mapper.parallelScan({
				valueConstructor: ScannableItem,
				segments: 4,
			});
			await iter.next();
		});
	});

	describe('#put', () => {
		const promiseFunc = jest.fn(async () =>
			Promise.resolve({Item: {}} as PutItemOutput),
		);
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		beforeEach(() => {
			promiseFunc.mockClear();
			mockDynamoDbClient.reset();
			mockDynamoDbClient.on(PutItemCommand).callsFake(promiseFunc);
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		it('should throw if the item does not provide a schema per the data mapper protocol', async () => {
			await expect(
				mapper.put({
					[DynamoDbTable]: 'foo',
				}),
			).rejects.toMatchObject(
				new Error(
					'The provided item did not adhere to the DynamoDbDocument protocol. No object property was found at the `DynamoDbSchema` symbol',
				),
			);
		});

		it('should throw if the item does not provide a table name per the data mapper protocol', async () => {
			await expect(
				mapper.put({
					[DynamoDbSchema]: {},
				}),
			).rejects.toMatchObject(
				new Error(
					'The provided item did not adhere to the DynamoDbTable protocol. No string property was found at the `DynamoDbTable` symbol',
				),
			);
		});

		it('should use the table name specified in the supplied table definition', async () => {
			const tableName = 'foo';
			await mapper.put({
				[DynamoDbTable]: tableName,
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).toMatchObject({TableName: tableName});
		});

		it('should apply a table name prefix provided to the mapper constructor', async () => {
			const tableNamePrefix = 'INTEG_';
			const mapper = new DataMapper({
				client: mockDynamoDbClient as unknown as DynamoDBClient,
				tableNamePrefix,
			});
			const tableName = 'foo';
			await mapper.put({
				[DynamoDbTable]: tableName,
				[DynamoDbSchema]: {},
			});

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).toMatchObject({TableName: tableNamePrefix + tableName});
		});

		it('should marshall the supplied item according to the schema', async () => {
			await mapper.put({
				fizz: 'buzz',
				pop: new Date(60_000),
				snap: false,
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {type: 'String'},
					pop: {type: 'Date'},
					snap: {
						type: 'Boolean',
						attributeName: 'crackle',
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).toMatchObject({
				Item: {
					fizz: {S: 'buzz'},
					pop: {N: '60'},
					crackle: {BOOL: false},
				},
			});
		});

		it('should include a condition expression and increment the version number when the schema contains a version attribute', async () => {
			await mapper.put({
				fizz: 'buzz',
				pop: 21,
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).toMatchObject({
				Item: {
					foo: {S: 'buzz'},
					pop: {N: '22'},
				},
				ConditionExpression: '#attr0 = :val1',
				ExpressionAttributeNames: {'#attr0': 'pop'},
				ExpressionAttributeValues: {':val1': 21},
			});
		});

		it('should include a condition expression requiring that no versioned item be present when the schema contains a version attribute but the value is undefined', async () => {
			await mapper.put({
				fizz: 'buzz',
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).toEqual({
				Item: {
					foo: {S: 'buzz'},
					pop: {N: '0'},
				},
				ConditionExpression: 'attribute_not_exists(#attr0)',
				ExpressionAttributeNames: {'#attr0': 'pop'},
				TableName: 'foo',
			});
		});

		it('should not include a condition expression when the skipVersionCheck input parameter is true', async () => {
			await mapper.put(
				{
					fizz: 'buzz',
					pop: 21,
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
					},
				},
				{skipVersionCheck: true},
			);

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).not.toHaveProperty('ConditionExpression');
		});

		it('should not include a condition expression when the mapper\'s default skipVersionCheck input parameter is true', async () => {
			const mapper = new DataMapper({
				client: mockDynamoDbClient as unknown as DynamoDBClient,
				skipVersionCheck: true,
			});
			await mapper.put({
				fizz: 'buzz',
				pop: 21,
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					fizz: {
						type: 'String',
						attributeName: 'foo',
						keyType: 'HASH',
					},
					pop: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).not.toHaveProperty('ConditionExpression');
		});

		it('should combine the version condition with any other condition expression', async () => {
			await mapper.put(
				{
					fizz: 'buzz',
					pop: 21,
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
						quux: {type: 'Date'},
					},
				},
				{
					condition: {
						type: 'LessThan',
						subject: 'quux',
						object: 600_000,
					},
				},
			);

			expect(
				mockDynamoDbClient.commandCalls(PutItemCommand)[0].args[0].input,
			).toMatchObject({
				ConditionExpression: '(#attr0 < :val1) AND (#attr2 = :val3)',
				ExpressionAttributeNames: {
					'#attr0': 'quux',
					'#attr2': 'pop',
				},
				ExpressionAttributeValues: {
					':val1': 600_000,
					':val3': 21,
				},
			});
		});

		it('should return the unmarshalled input', async () => {
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({} as PutItemOutput),
			);

			const result = await mapper.put({
				[DynamoDbTable]: 'foo',
				[DynamoDbSchema]: {
					foo: {
						type: 'String',
						attributeName: 'fizz',
						defaultProvider: () => 'keykey',
						keyType: 'HASH',
					},
					bar: {
						type: 'Number',
						versionAttribute: true,
					},
				},
			});

			expect(result).toMatchObject({
				foo: 'keykey',
				bar: 0,
			});
		});

		it('should support the legacy call pattern', async () => {
			await mapper.put({
				item: {
					fizz: 'buzz',
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						fizz: {
							type: 'String',
							attributeName: 'foo',
							keyType: 'HASH',
						},
						pop: {
							type: 'Number',
							versionAttribute: true,
						},
					},
				},
			});
		});

		it('should return an instance of the provided class', async () => {
			promiseFunc.mockImplementation(async () => Promise.resolve({}));

			class Item {
				get [DynamoDbTable]() {
					return 'foo';
				}

				get [DynamoDbSchema]() {
					return {
						foo: {
							type: 'String',
							attributeName: 'fizz',
							defaultProvider: () => 'keykey',
							keyType: 'HASH',
						},
						bar: {
							type: 'Number',
							versionAttribute: true,
						},
					};
				}
			}
			const result = await mapper.put(new Item());

			expect(result).toMatchObject({
				foo: 'keykey',
				bar: 0,
			});

			expect(result).toBeInstanceOf(Item);
		});
	});

	describe('#query', () => {
		const promiseFunc = jest.fn();

		const mockDynamoDbClient = mockClient(DynamoDBClient);
		mockDynamoDbClient.on(QueryCommand).callsFake(promiseFunc);

		beforeEach(() => {
			promiseFunc.mockClear();
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({Attributes: {}}),
			);
			mockDynamoDbClient.resetHistory();
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class QueryableItem {
			snap!: string;
			fizz?: string[];

			get [DynamoDbTable]() {
				return 'foo';
			}

			get [DynamoDbSchema]() {
				return {
					snap: {
						type: 'String',
						keyType: 'HASH',
					},
					fizz: {
						type: 'List',
						memberType: {type: 'String'},
						attributeName: 'fizzes',
					},
				};
			}

			static fromKey(key: string) {
				const target = new QueryableItem();
				target.snap = key;
				return target;
			}
		}

		it('should throw if the item does not provide a schema per the data mapper protocol', () => {
			expect(() =>
				mapper.query(
					class {
						get [DynamoDbTable]() {
							return 'foo';
						}
					},
					{foo: 'buzz'},
				),
			).toThrow(
				'The provided item did not adhere to the DynamoDbDocument protocol. No object property was found at the `DynamoDbSchema` symbol',
			);
		});

		it('should throw if the item does not provide a table name per the data mapper protocol', () => {
			expect(() =>
				mapper.query(
					class {
						get [DynamoDbSchema]() {
							return {};
						}
					},
					{foo: 'buzz'},
				),
			).toThrow(
				'The provided item did not adhere to the DynamoDbTable protocol. No string property was found at the `DynamoDbTable` symbol',
			);
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

			class QueryableItem {
				get [DynamoDbTable]() {
					return 'foo';
				}

				get [DynamoDbSchema]() {
					return {
						foo: {
							type: 'String',
							attributeName: 'fizz',
							keyType: 'HASH',
						},
						bar: {
							type: 'Set',
							memberType: 'Number',
						},
						baz: {
							type: 'Tuple',
							members: [{type: 'Boolean'}, {type: 'Number'}],
						},
					};
				}
			}

			const results: any[] = [];
			for await (const res of mapper.query(QueryableItem, {
				foo: 'buzz',
			})) {
				results.push(res);
			}

			expect(results).toEqual([
				{
					foo: 'snap',
					bar: new Set([1, 2, 3]),
					baz: [true, 4],
				},
				{
					foo: 'crackle',
					bar: new Set([5, 6, 7]),
					baz: [false, 8],
				},
				{
					foo: 'pop',
					bar: new Set([9, 12, 30]),
					baz: [true, 24],
				},
			]);

			for (const queriedItem of results) {
				expect(queriedItem).toBeInstanceOf(QueryableItem);
			}
		});

		it('should request a consistent read if the readConsistency is StronglyConsistent', async () => {
			const results = mapper.query(
				QueryableItem,
				{foo: 'bar'},
				{readConsistency: 'strong'},
			);

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toMatchObject({
				ConsistentRead: true,
			});
		});

		it('should allow a condition expression as the keyCondition', async () => {
			const results = mapper.query(
				class {
					get [DynamoDbTable]() {
						return 'foo';
					}

					get [DynamoDbSchema]() {
						return {
							snap: {
								type: 'String',
								keyType: 'HASH',
							},
							fizz: {
								type: 'String',
								keyType: 'RANGE',
							},
						};
					}
				},
				{
					type: 'And',
					conditions: [
						{
							type: 'Equals',
							subject: 'snap',
							object: 'crackle',
						},
						new FunctionExpression(
							'begins_with',
							new AttributePath('fizz'),
							'buz',
						),
					],
				},
			);

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toMatchObject({
				KeyConditionExpression:
                    '(#attr0 = :val1) AND (begins_with(#attr2, :val3))',
				ExpressionAttributeNames: {
					'#attr0': 'snap',
					'#attr2': 'fizz',
				},
				ExpressionAttributeValues: {
					':val1': 'crackle',
					':val3': 'buz',
				},
			});
		});

		it('should allow a condition expression predicate in the keyCondition', async () => {
			const results = mapper.query(QueryableItem, {
				snap: 'crackle',
				pop: between(10, 20),
			});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toMatchObject({
				KeyConditionExpression:
                    '(#attr0 = :val1) AND (#attr2 BETWEEN :val3 AND :val4)',
				ExpressionAttributeNames: {
					'#attr0': 'snap',
					'#attr2': 'pop',
				},
				ExpressionAttributeValues: {
					':val1': 'crackle',
					':val3': 10,
					':val4': 20,
				},
			});
		});

		it('should allow a filter expression', async () => {
			const results = mapper.query(
				QueryableItem,
				{snap: 'crackle'},
				{
					filter: {
						subject: 'fizz[1]',
						...inList('buzz', 'pop'),
					},
				},
			);

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toMatchObject({
				FilterExpression: '#attr2[1] IN (:val3, :val4)',
				ExpressionAttributeNames: {
					'#attr0': 'snap',
					'#attr2': 'fizzes',
				},
				ExpressionAttributeValues: {
					':val1': 'crackle',
					':val3': 'buzz',
					':val4': 'pop',
				},
			});
		});

		it('should allow a projection expression', async () => {
			const results = mapper.query(
				QueryableItem,
				{snap: 'crackle'},
				{projection: ['snap', 'fizz[1]']},
			);

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toMatchObject({
				ProjectionExpression: '#attr0, #attr2[1]',
				ExpressionAttributeNames: {
					'#attr0': 'snap',
					'#attr2': 'fizzes',
				},
				ExpressionAttributeValues: {
					':val1': 'crackle',
				},
			});
		});

		it('should allow a start key', async () => {
			const results = mapper.query(
				class {
					get [DynamoDbTable]() {
						return 'foo';
					}

					get [DynamoDbSchema]() {
						return {
							snap: {
								type: 'String',
								keyType: 'HASH',
							},
							fizz: {
								type: 'Number',
								keyType: 'RANGE',
							},
						};
					}
				},
				{snap: 'crackle'},
				{startKey: {fizz: 100}},
			);

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toMatchObject({
				ExclusiveStartKey: {
					fizz: {N: '100'},
				},
			});
		});

		it('supports the legacy call pattern', async () => {
			const iter = mapper.query({
				valueConstructor: QueryableItem,
				keyCondition: {snap: 'crackle'},
				indexName: 'baz-index',
				pageSize: 1,
				scanIndexForward: true,
			});

			await iter.next();

			expect(
				mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0].input,
			).toEqual({
				TableName: 'foo',
				KeyConditionExpression: '#attr0 = :val1',
				ExpressionAttributeNames: {
					'#attr0': 'snap',
				},
				ExpressionAttributeValues: {
					':val1': 'crackle',
				},
				IndexName: 'baz-index',
				Limit: 1,
				ScanIndexForward: true,
			});
		});

		it('should track usage metadata', async () => {
			const ScannedCount = 3;
			const ConsumedCapacity = {
				TableName: 'foo',
				CapacityUnits: 4,
			};
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [{snap: 'foo'}, {snap: 'bar'}],
					LastEvaluatedKey: {snap: 'bar'},
					Count: 2,
					ScannedCount,
					ConsumedCapacity,
				}),
			);

			const iterator = mapper.query(QueryableItem, {
				snap: 'crackle',
			});
			await iterator.next();

			// Only items actually yielded should be counted in `count`
			expect(iterator.count).toBe(1);
			// `consumedCapacity` and `scannedCount` should relay information
			// from the API response
			expect(iterator.scannedCount).toBe(ScannedCount);
			expect(iterator.consumedCapacity).toMatchObject(ConsumedCapacity);
		});

		it('should support detaching the paginator', async () => {
			const ScannedCount = 3;
			const ConsumedCapacity = {
				TableName: 'foo',
				CapacityUnits: 4,
			};
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [{snap: {S: 'foo'}}, {snap: {S: 'bar'}}],
					Count: 2,
					ScannedCount,
					ConsumedCapacity,
				}),
			);

			const paginator = mapper
				.query(QueryableItem, {snap: 'crackle'})
				.pages();
			for await (const page of paginator) {
				expect(page).toEqual([
					QueryableItem.fromKey('foo'),
					QueryableItem.fromKey('bar'),
				]);
			}

			expect(paginator.count).toBe(2);
			expect(paginator.scannedCount).toBe(ScannedCount);
			expect(paginator.consumedCapacity).toMatchObject(ConsumedCapacity);
		});

		it('should cease iteration once the limit has been reached', async () => {
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [
						{snap: {S: 'snap'}},
						{snap: {S: 'crackle'}},
						{snap: {S: 'pop'}},
					],
					LastEvaluatedKey: {snap: {S: 'pop'}},
				}),
			);
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [{snap: {S: 'fizz'}}],
					LastEvaluatedKey: {snap: {S: 'fizz'}},
				}),
			);
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [{snap: {S: 'buzz'}}],
					LastEvaluatedKey: {snap: {S: 'buzz'}},
				}),
			);

			const results = mapper.query(
				QueryableItem,
				{snap: 'crackle'},
				{limit: 5},
			);

			for await (const _ of results) {
				// Pass
			}

			expect(results.pages().lastEvaluatedKey).toEqual(
				QueryableItem.fromKey('buzz'),
			);

			expect(
				mockDynamoDbClient
					.commandCalls(QueryCommand)
					.map(call => [call.args[0].input]),
			).toEqual([
				[
					{
						TableName: 'foo',
						Limit: 5,
						KeyConditionExpression: '#attr0 = :val1',
						ExpressionAttributeNames: {'#attr0': 'snap'},
						ExpressionAttributeValues: {
							':val1': 'crackle',
						},
					},
				],
				[
					{
						TableName: 'foo',
						Limit: 2,
						KeyConditionExpression: '#attr0 = :val1',
						ExpressionAttributeNames: {'#attr0': 'snap'},
						ExpressionAttributeValues: {
							':val1': 'crackle',
						},
						ExclusiveStartKey: {
							snap: {S: 'pop'},
						},
					},
				],
				[
					{
						TableName: 'foo',
						Limit: 1,
						KeyConditionExpression: '#attr0 = :val1',
						ExpressionAttributeNames: {'#attr0': 'snap'},
						ExpressionAttributeValues: {
							':val1': 'crackle',
						},
						ExclusiveStartKey: {
							snap: {S: 'fizz'},
						},
					},
				],
			]);
		});

		describe('startKey serialization', () => {
			class MyItem {
				snap?: string;
				crackle?: number;
				pop?: Date;

				constructor(key?: string) {
					this.snap = key;
				}

				get [DynamoDbTable]() {
					return 'table';
				}

				get [DynamoDbSchema]() {
					return {
						snap: {
							type: 'String',
							keyType: 'HASH',
						},
						crackle: {
							type: 'Number',
							keyType: 'RANGE',
							defaultProvider: () => 0,
							indexKeyConfigurations: {
								myIndex: {keyType: 'RANGE'},
							},
						},
						pop: {
							type: 'Date',
							defaultProvider: () => new Date(),
							indexKeyConfigurations: {
								myIndex: {keyType: 'HASH'},
							},
						},
					};
				}
			}

			it('should not inject default values into the startKey', async () => {
				const iter = mapper.query(
					MyItem,
					{snap: 'key'},
					{startKey: new MyItem('key')},
				);
				await iter.next();

				expect(
					mockDynamoDbClient.commandCalls(QueryCommand)[0].args[0]
						.input.ExclusiveStartKey,
				).toEqual({
					snap: {S: 'key'},
				});
			});
		});
	});

	describe('#scan', () => {
		const promiseFunc = jest.fn();
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		beforeEach(() => {
			promiseFunc.mockClear();
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({Items: []}),
			);
			mockDynamoDbClient.reset();
			mockDynamoDbClient.on(ScanCommand).callsFake(promiseFunc);
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		class ScannableItem {
			snap!: string;
			fizz?: string[];

			get [DynamoDbTable]() {
				return 'foo';
			}

			get [DynamoDbSchema]() {
				return {
					snap: {
						type: 'String',
						keyType: 'HASH',
					},
					fizz: {
						type: 'List',
						memberType: {type: 'String'},
						attributeName: 'fizzes',
					},
				};
			}

			static fromKey(key: string) {
				const target = new ScannableItem();
				target.snap = key;
				return target;
			}
		}

		it('should throw if the item does not provide a schema per the data mapper protocol', () => {
			expect(() =>
				mapper.scan(
					class {
						get [DynamoDbTable]() {
							return 'foo';
						}
					},
				),
			).toThrow(
				'The provided item did not adhere to the DynamoDbDocument protocol. No object property was found at the `DynamoDbSchema` symbol',
			);
		});

		it('should throw if the item does not provide a table name per the data mapper protocol', () => {
			expect(() =>
				mapper.scan(
					class {
						get [DynamoDbSchema]() {
							return {};
						}
					},
				),
			).toThrow(
				'The provided item did not adhere to the DynamoDbTable protocol. No string property was found at the `DynamoDbTable` symbol',
			);
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

			class ScannableItem {
				get [DynamoDbTable]() {
					return 'foo';
				}

				get [DynamoDbSchema]() {
					return {
						foo: {
							type: 'String',
							attributeName: 'fizz',
							keyType: 'HASH',
						},
						bar: {
							type: 'Set',
							memberType: 'Number',
						},
						baz: {
							type: 'Tuple',
							members: [{type: 'Boolean'}, {type: 'Number'}],
						},
					};
				}
			}

			const results = mapper.scan(ScannableItem);

			const result: any[] = [];
			for await (const res of results) {
				result.push(res);
			}

			expect(result).toEqual([
				{
					foo: 'snap',
					bar: new Set([1, 2, 3]),
					baz: [true, 4],
				},
				{
					foo: 'crackle',
					bar: new Set([5, 6, 7]),
					baz: [false, 8],
				},
				{
					foo: 'pop',
					bar: new Set([9, 12, 30]),
					baz: [true, 24],
				},
			]);

			for (const item of result) {
				expect(item).toBeInstanceOf(ScannableItem);
			}
		});

		it('should request a consistent read if the readConsistency is StronglyConsistent', async () => {
			const results = mapper.scan(ScannableItem, {
				readConsistency: 'strong',
			});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				ConsistentRead: true,
			});
		});

		it('should allow a filter expression', async () => {
			const results = mapper.scan(ScannableItem, {
				filter: {
					type: 'Not',
					condition: {
						subject: 'fizz[1]',
						...equals('buzz'),
					},
				},
			});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				FilterExpression: 'NOT (#attr0[1] = :val1)',
				ExpressionAttributeNames: {
					'#attr0': 'fizzes',
				},
				ExpressionAttributeValues: {
					':val1': 'buzz',
				},
			});
		});

		it('should allow a projection expression', async () => {
			const results = mapper.scan(ScannableItem, {
				projection: ['snap', 'fizz[1]'],
			});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				ProjectionExpression: '#attr0, #attr1[1]',
				ExpressionAttributeNames: {
					'#attr0': 'snap',
					'#attr1': 'fizzes',
				},
			});
		});

		it('should allow a start key', async () => {
			const results = mapper.scan(
				class {
					get [DynamoDbTable]() {
						return 'foo';
					}

					get [DynamoDbSchema]() {
						return {
							snap: {
								type: 'String',
								keyType: 'HASH',
							},
							fizz: {
								type: 'Number',
								keyType: 'RANGE',
							},
						};
					}
				},
				{startKey: {fizz: 100}},
			);

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				ExclusiveStartKey: {
					fizz: {N: '100'},
				},
			});
		});

		it('should allow the page size to be set', async () => {
			const results = mapper.scan(ScannableItem, {pageSize: 20});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				Limit: 20,
			});
		});

		it('should not use a page size greater than the "limit" parameter', async () => {
			const results = mapper.scan(ScannableItem, {
				limit: 20,
				pageSize: 200,
			});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				Limit: 20,
			});
		});

		it('should not use a page size greater than the "pageSize" parameter', async () => {
			const results = mapper.scan(ScannableItem, {
				pageSize: 20,
				limit: 200,
			});

			await results.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toMatchObject({
				Limit: 20,
			});
		});

		it('should cease iteration once the limit has been reached', async () => {
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [
						{snap: {S: 'snap'}},
						{snap: {S: 'crackle'}},
						{snap: {S: 'pop'}},
					],
					LastEvaluatedKey: {snap: {S: 'pop'}},
				}),
			);
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [{snap: {S: 'fizz'}}],
					LastEvaluatedKey: {snap: {S: 'fizz'}},
				}),
			);
			promiseFunc.mockImplementationOnce(async () =>
				Promise.resolve({
					Items: [{snap: {S: 'buzz'}}],
					LastEvaluatedKey: {snap: {S: 'buzz'}},
				}),
			);

			const results = mapper.scan(ScannableItem, {limit: 5});

			for await (const _ of results) {
				// Pass
			}

			expect(results.pages().lastEvaluatedKey).toEqual(
				ScannableItem.fromKey('buzz'),
			);

			expect(
				mockDynamoDbClient
					.commandCalls(ScanCommand)
					.map(call => [call.args[0].input]),
			).toEqual([
				[
					{
						TableName: 'foo',
						Limit: 5,
					},
				],
				[
					{
						TableName: 'foo',
						Limit: 2,
						ExclusiveStartKey: {
							snap: {S: 'pop'},
						},
					},
				],
				[
					{
						TableName: 'foo',
						Limit: 1,
						ExclusiveStartKey: {
							snap: {S: 'fizz'},
						},
					},
				],
			]);
		});

		it('should support the legacy call pattern', async () => {
			const iter = mapper.scan({
				valueConstructor: ScannableItem,
				indexName: 'baz-index',
			});

			await iter.next();

			expect(
				mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0].input,
			).toEqual({
				TableName: 'foo',
				IndexName: 'baz-index',
			});
		});

		describe('startKey serialization', () => {
			class MyItem {
				snap?: string;
				crackle?: number;
				pop?: Date;

				constructor(key?: string) {
					this.snap = key;
				}

				get [DynamoDbTable]() {
					return 'table';
				}

				get [DynamoDbSchema]() {
					return {
						snap: {
							type: 'String',
							keyType: 'HASH',
						},
						crackle: {
							type: 'Number',
							keyType: 'RANGE',
							defaultProvider: () => 0,
							indexKeyConfigurations: {
								myIndex: {keyType: 'RANGE'},
							},
						},
						pop: {
							type: 'Date',
							defaultProvider: () => new Date(),
							indexKeyConfigurations: {
								myIndex: {keyType: 'HASH'},
							},
						},
					};
				}
			}

			it('should not inject default properties into the startKey', async () => {
				const iter = mapper.scan(MyItem, {
					startKey: new MyItem('key'),
				});
				await iter.next();

				expect(
					mockDynamoDbClient.commandCalls(ScanCommand)[0].args[0]
						.input.ExclusiveStartKey,
				).toEqual({
					snap: {S: 'key'},
				});
			});
		});
	});

	describe('updating items', () => {
		const tableName = 'foo';

		class EmptyItem {
			get [DynamoDbTable]() {
				return tableName;
			}

			get [DynamoDbSchema]() {
				return {};
			}
		}

		class ComplexItem extends EmptyItem {
			foo!: string;
			bar?: [number, BinaryValue];
			quux?: {
				snap: string;
				crackle: Date;
				pop: Record<string, any>;
			};

			get [DynamoDbSchema]() {
				return {
					foo: {
						type: 'String',
						keyType: 'HASH',
						attributeName: 'fizz',
					},
					bar: {
						type: 'Tuple',
						members: [{type: 'Number'}, {type: 'Binary'}],
						attributeName: 'buzz',
					},
					quux: {
						type: 'Document',
						members: {
							snap: {type: 'String'},
							crackle: {type: 'Date'},
							pop: {type: 'Hash'},
						} as Schema,
					},
				};
			}
		}

		const promiseFunc = jest.fn();
		const mockDynamoDbClient = mockClient(DynamoDBClient);

		beforeEach(() => {
			promiseFunc.mockClear();
			promiseFunc.mockImplementation(async () =>
				Promise.resolve({Attributes: {}}),
			);
			mockDynamoDbClient.reset();
			mockDynamoDbClient.on(UpdateItemCommand).callsFake(promiseFunc);
		});

		const mapper = new DataMapper({
			client: mockDynamoDbClient as unknown as DynamoDBClient,
		});

		describe('#update', () => {
			it('should throw if the item does not provide a schema per the data mapper protocol', async () => {
				await expect(
					mapper.update({
						[DynamoDbTable]: 'foo',
					}),
				).rejects.toMatchObject(
					new Error(
						'The provided item did not adhere to the DynamoDbDocument protocol. No object property was found at the `DynamoDbSchema` symbol',
					),
				);
			});

			it('should throw if the item does not provide a table name per the data mapper protocol', async () => {
				await expect(
					mapper.update({
						[DynamoDbSchema]: {},
					}),
				).rejects.toMatchObject(
					new Error(
						'The provided item did not adhere to the DynamoDbTable protocol. No string property was found at the `DynamoDbTable` symbol',
					),
				);
			});

			it('should use the table name specified in the supplied table definition', async () => {
				const tableName = 'foo';
				await mapper.update({item: new EmptyItem()});

				expect(
					mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
						.args[0].input,
				).toMatchObject({
					TableName: tableName,
				});
			});

			it('should apply a table name prefix provided to the mapper constructor', async () => {
				const tableNamePrefix = 'INTEG_';
				const mapper = new DataMapper({
					client: mockDynamoDbClient as unknown as DynamoDBClient,
					tableNamePrefix,
				});
				const tableName = 'foo';
				await mapper.update(new EmptyItem());

				expect(
					mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
						.args[0].input,
				).toMatchObject({
					TableName: tableNamePrefix + tableName,
				});
			});

			it('should marshall updates into an UpdateItemInput', async () => {
				const item = new ComplexItem();
				item.foo = 'key';
				item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];

				await mapper.update(item);

				expect(
					mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
						.args[0].input,
				).toMatchObject({
					TableName: tableName,
					Key: {
						fizz: {S: 'key'},
					},
					ExpressionAttributeNames: {
						'#attr0': 'buzz',
						'#attr2': 'quux',
					},
					ExpressionAttributeValues: {
						':val1': {
							marshalled: {
								L: [
									{N: '1'},
									{
										B: Uint8Array.from([
											0xDE, 0xAD, 0xBE, 0xEF,
										]),
									},
								],
							},
						},
					},
					UpdateExpression: 'SET #attr0 = :val1 REMOVE #attr2',
				});
			});

			it('should not remove missing keys when onMissing is "SKIP"', async () => {
				const item = new ComplexItem();
				item.foo = 'key';
				item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];
				await mapper.update(item, {onMissing: 'skip'});

				expect(
					mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
						.args[0].input,
				).toMatchObject({
					TableName: tableName,
					Key: {
						fizz: {S: 'key'},
					},
					ExpressionAttributeNames: {
						'#attr0': 'buzz',
					},
					ExpressionAttributeValues: {
						':val1': {
							marshalled: {
								L: [
									{N: '1'},
									{
										B: Uint8Array.from([
											0xDE, 0xAD, 0xBE, 0xEF,
										]),
									},
								],
							},
						},
					},
					UpdateExpression: 'SET #attr0 = :val1',
				});
			});

			it('should unmarshall any returned attributes', async () => {
				promiseFunc.mockImplementation(async () =>
					Promise.resolve({
						Attributes: {
							fizz: {S: 'buzz'},
							bar: {NS: ['1', '2', '3']},
							baz: {L: [{BOOL: true}, {N: '4'}]},
						},
					}),
				);

				const result = await mapper.update({
					foo: 'buzz',
					[DynamoDbTable]: 'foo',
					[DynamoDbSchema]: {
						foo: {
							type: 'String',
							attributeName: 'fizz',
							keyType: 'HASH',
						},
						bar: {
							type: 'Set',
							memberType: 'Number',
						},
						baz: {
							type: 'Tuple',
							members: [{type: 'Boolean'}, {type: 'Number'}],
						},
					},
				});

				expect(result).toEqual({
					foo: 'buzz',
					bar: new Set([1, 2, 3]),
					baz: [true, 4],
				});
			});

			it('should throw an error if no attributes were returned', async () => {
				promiseFunc.mockImplementation(async () => Promise.resolve({}));

				return expect(
					mapper.update({
						foo: 'buzz',
						[DynamoDbTable]: 'foo',
						[DynamoDbSchema]: {
							foo: {
								type: 'String',
								attributeName: 'fizz',
								keyType: 'HASH',
							},
							bar: {
								type: 'Set',
								memberType: 'Number',
							},
							baz: {
								type: 'Tuple',
								members: [
									{type: 'Boolean'},
									{type: 'Number'},
								],
							},
						},
					}),
				).rejects.toMatchObject(
					new Error(
						'Update operation completed successfully, but the updated value was not returned',
					),
				);
			});

			describe('version attributes', () => {
				class VersionedItem {
					foo!: string;
					bar?: [number, Uint8Array];
					baz?: number;

					get [DynamoDbTable]() {
						return 'table';
					}

					get [DynamoDbSchema]() {
						return {
							foo: {
								type: 'String',
								keyType: 'HASH',
								attributeName: 'fizz',
							},
							bar: {
								type: 'Tuple',
								members: [
									{type: 'Number'},
									{type: 'Binary'},
								],
								attributeName: 'buzz',
							},
							baz: {
								type: 'Number',
								versionAttribute: true,
							},
						};
					}
				}

				it('should inject a conditional expression requiring the absence of the versioning property and set its value to 0 when an object without a value for it is marshalled', async () => {
					const item = new VersionedItem();
					item.foo = 'key';
					item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];

					await mapper.update(item);

					expect(
						mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
							.args[0].input,
					).toMatchObject({
						TableName: 'table',
						Key: {
							fizz: {S: 'key'},
						},
						ConditionExpression: 'attribute_not_exists(#attr0)',
						ExpressionAttributeNames: {
							'#attr0': 'baz',
							'#attr1': 'buzz',
						},
						ExpressionAttributeValues: {
							':val2': {
								marshalled: {
									L: [
										{N: '1'},
										{
											B: Uint8Array.from([
												0xDE, 0xAD, 0xBE, 0xEF,
											]),
										},
									],
								},
							},
							':val3': 0,
						},
						UpdateExpression: 'SET #attr1 = :val2, #attr0 = :val3',
					});
				});

				it('should inject a conditional expression requiring the known value of the versioning property and set its value to the previous value + 1 when an object with a value for it is marshalled', async () => {
					const item = new VersionedItem();
					item.foo = 'key';
					item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];
					item.baz = 10;

					await mapper.update(item);

					expect(
						mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
							.args[0].input,
					).toMatchObject({
						TableName: 'table',
						Key: {
							fizz: {S: 'key'},
						},
						ConditionExpression: '#attr0 = :val1',
						ExpressionAttributeNames: {
							'#attr0': 'baz',
							'#attr2': 'buzz',
						},
						ExpressionAttributeValues: {
							':val1': 10,
							':val3': {
								marshalled: {
									L: [
										{N: '1'},
										{
											B: Uint8Array.from([
												0xDE, 0xAD, 0xBE, 0xEF,
											]),
										},
									],
								},
							},
							':val4': 1,
						},
						UpdateExpression:
                            'SET #attr2 = :val3, #attr0 = #attr0 + :val4',
					});
				});

				it('should not include a condition expression when the skipVersionCheck input parameter is true', async () => {
					const item = new VersionedItem();
					item.foo = 'key';
					item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];
					item.baz = 10;

					await mapper.update(item, {skipVersionCheck: true});

					expect(
						mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
							.args[0].input,
					).not.toHaveProperty('ConditionExpression');
				});

				it('should not include a condition expression when the mapper\'s default skipVersionCheck input parameter is true', async () => {
					const mapper = new DataMapper({
						client: mockDynamoDbClient as unknown as DynamoDBClient,
						skipVersionCheck: true,
					});

					const item = new VersionedItem();
					item.foo = 'key';
					item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];
					item.baz = 10;

					await mapper.update(item);

					expect(
						mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
							.args[0].input,
					).not.toHaveProperty('ConditionExpression');
				});

				it('should combine the version condition with any other condition expression', async () => {
					const item = new VersionedItem();
					item.foo = 'key';
					item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];
					item.baz = 10;

					await mapper.update(item, {
						condition: {
							type: 'LessThan',
							subject: 'bar[0]',
							object: 600_000,
						},
					});

					expect(
						mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
							.args[0].input,
					).toMatchObject({
						ConditionExpression:
                            '(#attr0[0] < :val1) AND (#attr2 = :val3)',
						ExpressionAttributeNames: {
							'#attr0': 'buzz',
							'#attr2': 'baz',
						},
						ExpressionAttributeValues: {
							':val1': 600_000,
							':val3': 10,
							':val4': {
								// Need to get rid of this
								marshalled: {
									L: [
										{N: '1'},
										{
											B: Uint8Array.from([
												0xDE, 0xAD, 0xBE, 0xEF,
											]),
										},
									],
								},
							},
						},
					});
				});
			});

			it('should support the legacy call pattern', async () => {
				await mapper.update({
					item: {
						fizz: 'buzz',
						[DynamoDbTable]: 'foo',
						[DynamoDbSchema]: {
							fizz: {
								type: 'String',
								attributeName: 'foo',
								keyType: 'HASH',
							},
							pop: {
								type: 'Number',
								versionAttribute: true,
							},
						},
					},
				});
			});

			it('should return an instance of the provided class', async () => {
				const item = new ComplexItem();
				item.foo = 'key';
				item.bar = [1, Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF])];

				const result = await mapper.update(item);

				expect(result).toBeInstanceOf(ComplexItem);
			});
		});

		describe('#executeUpdateExpression', () => {
			it('should use the provided schema to execute the provided expression', async () => {
				const expression = new UpdateExpression();
				expression.set(
					new AttributePath('bar[1]'),
					Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF]),
				);

				const updated = await mapper.executeUpdateExpression(
					expression,
					{foo: 'key'},
					ComplexItem,
				);

				expect(updated).toBeInstanceOf(ComplexItem);
				expect(
					mockDynamoDbClient.commandCalls(UpdateItemCommand)[0]
						.args[0].input,
				).toMatchObject({
					TableName: tableName,
					Key: {
						fizz: {S: 'key'},
					},
					ExpressionAttributeNames: {
						'#attr0': 'buzz',
					},
					ExpressionAttributeValues: {
						// TODO: is this shit intended?
						':val1': Uint8Array.from([0xDE, 0xAD, 0xBE, 0xEF]),
						// ":val1": { B: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]) },
					},
					UpdateExpression: 'SET #attr0[1] = :val1',
				});
			});
		});
	});
});
