import { BatchGetItemCommand, BatchGetItemOutput, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { BatchGet, MAX_READ_BATCH_SIZE } from '../src/BatchGet';
import { AttributeMap } from '../src/types';

describe('BatchGet', () => {
  const promiseFunc = vitest.fn(async () =>
    Promise.resolve({
      UnprocessedKeys: {},
    } as BatchGetItemOutput)
  );
  // Const mockDynamoDbClient = {
  //     config: {},
  //     batchGetItem: vitest.fn(() => ({promise: promiseFunc})),
  // } as any;
  const mockDynamoDbClient = mockClient(DynamoDBClient);

  mockDynamoDbClient.on(BatchGetItemCommand).callsFake(promiseFunc);

  beforeEach(() => {
    promiseFunc.mockClear();
    mockDynamoDbClient.resetHistory();
    // MockDynamoDbClient.batchGetItem.mockClear();
  });

  it('should return itself when its Symbol.asyncIterator method is called', () => {
    const batchGet = new BatchGet({} as any, []);
    expect(batchGet[Symbol.asyncIterator]()).toBe(batchGet);
  });

  it('should allow setting an overall read consistency', async () => {
    const batchGet = new BatchGet(
      mockDynamoDbClient as unknown as DynamoDBClient,
      [['foo', { fizz: { N: '0' } }]],
      { ConsistentRead: true }
    );
    for await (const _ of batchGet) {
      console.log(_ === undefined);
      // Pass
    }

    // Const [call] = mockDynamoDbClient.commandCalls(BatchGetItemCommand);
    // call.args[0].input;
    expect(
      mockDynamoDbClient.commandCalls(BatchGetItemCommand).map(({ args: [{ input }] }) => input)
    ).toEqual([
      // [
      {
        RequestItems: {
          foo: {
            Keys: [{ fizz: { N: '0' } }],
            ConsistentRead: true,
          },
        },
      },
      // ],
    ]);
  });

  it('should allow setting per-table read consistency', async () => {
    const batchGet = new BatchGet(
      mockDynamoDbClient as unknown as DynamoDBClient,
      [
        ['foo', { fizz: { N: '0' } }],
        ['bar', { quux: { N: '1' } }],
      ],
      {
        ConsistentRead: true,
        PerTableOptions: {
          bar: { ConsistentRead: false },
        },
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of batchGet) {
      // Pass
    }

    expect(
      // MockDynamoDbClient.batchGetItem.mock.calls

      mockDynamoDbClient.commandCalls(BatchGetItemCommand).map(({ args: [{ input }] }) => input)
    ).toEqual([
      // [
      {
        RequestItems: {
          foo: {
            Keys: [{ fizz: { N: '0' } }],
            ConsistentRead: true,
          },
          bar: {
            Keys: [{ quux: { N: '1' } }],
            ConsistentRead: false,
          },
        },
      },
      // ],
    ]);
  });

  it('should allow specifying per-table projection expressions', async () => {
    const batchGet = new BatchGet(
      mockDynamoDbClient as unknown as DynamoDBClient,
      [
        ['foo', { fizz: { N: '0' } }],
        ['bar', { quux: { N: '1' } }],
      ],
      {
        PerTableOptions: {
          bar: {
            ProjectionExpression: 'snap[1].crackle.pop[2]',
          },
        },
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of batchGet) {
      // Pass
    }

    expect(
      // MockDynamoDbClient.batchGetItem.mock.calls

      mockDynamoDbClient.commandCalls(BatchGetItemCommand).map(({ args: [{ input }] }) => input)
    ).toEqual([
      // [
      {
        RequestItems: {
          foo: {
            Keys: [{ fizz: { N: '0' } }],
          },
          bar: {
            Keys: [{ quux: { N: '1' } }],
            ProjectionExpression: 'snap[1].crackle.pop[2]',
          },
        },
      },
      // ],
    ]);
  });

  describe.each([true, false])('should', (asyncInput) => {
    // For (const asyncInput of [true, false]) {
    it(`partition get batches into requests with ${MAX_READ_BATCH_SIZE} or fewer items`, async () => {
      const gets: Array<[string, AttributeMap]> = [];
      const expected: Array<
        Array<{
          RequestItems: {
            snap: {
              Keys: Array<Record<string, Record<string, string>>>;
            };
            crackle: {
              Keys: Array<Record<string, Record<string, string>>>;
            };
            pop: {
              Keys: Array<Record<string, Record<string, string>>>;
            };
          };
        }>
      > = [
        [
          {
            RequestItems: {
              snap: { Keys: [] },
              crackle: { Keys: [] },
              pop: { Keys: [] },
            },
          },
        ],
        [
          {
            RequestItems: {
              snap: { Keys: [] },
              crackle: { Keys: [] },
              pop: { Keys: [] },
            },
          },
        ],
        [
          {
            RequestItems: {
              snap: { Keys: [] },
              crackle: { Keys: [] },
              pop: { Keys: [] },
            },
          },
        ],
        [
          {
            RequestItems: {
              snap: { Keys: [] },
              crackle: { Keys: [] },
              pop: { Keys: [] },
            },
          },
        ],
      ];
      const responses: Array<{
        Responses: {
          snap: Array<Record<string, Record<string, string>>>;
          crackle: Array<Record<string, Record<string, string>>>;
          pop: Array<Record<string, Record<string, string>>>;
        };
      }> = [
        {
          Responses: {
            snap: [],
            crackle: [],
            pop: [],
          },
        },
        {
          Responses: {
            snap: [],
            crackle: [],
            pop: [],
          },
        },
        {
          Responses: {
            snap: [],
            crackle: [],
            pop: [],
          },
        },
        {
          Responses: {
            snap: [],
            crackle: [],
            pop: [],
          },
        },
      ];

      for (let i = 0; i < 325; i++) {
        const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
        const fizz = { N: String(i) };
        const buzz = { S: 'Static string' };
        gets.push([table, { fizz: { N: String(i) } }]);

        responses[Math.floor(i / MAX_READ_BATCH_SIZE)].Responses[table].push({ fizz, buzz });
        expected[Math.floor(i / MAX_READ_BATCH_SIZE)][0].RequestItems[table].Keys.push({ fizz });
      }

      for (const response of responses) {
        promiseFunc.mockImplementationOnce(async () =>
          Promise.resolve(response as unknown as BatchGetItemOutput)
        );
      }

      const input = asyncInput
        ? (async function* () {
            for (const item of gets) {
              await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
              yield item;
            }
          })()
        : gets;

      const seen = new Set<number>();
      for await (const [table, item] of new BatchGet(
        mockDynamoDbClient as unknown as DynamoDBClient,
        input
      )) {
        const id = Number.parseInt(item.fizz.N!);
        expect(seen.has(id)).toBe(false);
        seen.add(id);

        if (id % 3 === 0) {
          expect(table).toBe('snap');
        } else if (id % 3 === 1) {
          expect(table).toBe('crackle');
        } else {
          expect(table).toBe('pop');
        }

        expect(item.buzz).toEqual({ S: 'Static string' });
      }

      expect(seen.size).toBe(gets.length);

      const calls = mockDynamoDbClient.commandCalls(BatchGetItemCommand);
      expect(calls.length).toBe(Math.ceil(gets.length / MAX_READ_BATCH_SIZE));
      expect(calls.map(({ args: [{ input }] }) => [input])).toEqual(expected);
    });

    it('retry unprocessed items', async () => {
      const failures = new Set(['24', '66', '99', '103', '142', '178', '204', '260', '288']);
      const gets: Array<[string, AttributeMap]> = [];

      for (let i = 0; i < 325; i++) {
        const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
        gets.push([table, { fizz: { N: String(i) } }]);
      }

      const toBeFailed = new Set(failures);
      promiseFunc.mockImplementation(async () => {
        const buzz = { S: 'Static string' };
        const response: BatchGetItemOutput = {};

        const { RequestItems = {} } = mockDynamoDbClient
          .commandCalls(BatchGetItemCommand)
          .slice(-1)[0].args[0].input;
        for (const tableName of Object.keys(RequestItems)) {
          for (const item of RequestItems[tableName]?.Keys ?? []) {
            if (toBeFailed.has(item.fizz.N)) {
              if (!response.UnprocessedKeys) {
                response.UnprocessedKeys = {};
              }

              if (!(tableName in response.UnprocessedKeys)) {
                response.UnprocessedKeys[tableName] = {
                  Keys: [],
                };
              }

              response.UnprocessedKeys[tableName].Keys?.push(item);
              toBeFailed.delete(item.fizz.N);
            } else {
              if (!response.Responses) {
                response.Responses = {};
              }

              if (!(tableName in response.Responses)) {
                response.Responses[tableName] = [];
              }

              response.Responses[tableName].push({
                ...item,
                buzz,
              });
            }
          }
        }

        return Promise.resolve(response);
      });

      const input = asyncInput
        ? (async function* () {
            for (const item of gets) {
              await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
              yield item;
            }
          })()
        : gets;

      const idsReturned = new Set<number>();
      for await (const [table, item] of new BatchGet(
        mockDynamoDbClient as unknown as DynamoDBClient,
        input
      )) {
        const id = Number.parseInt(item.fizz.N!, 10);
        expect(idsReturned.has(id)).toBe(false);
        idsReturned.add(id);

        if (id % 3 === 0) {
          expect(table).toBe('snap');
        } else if (id % 3 === 1) {
          expect(table).toBe('crackle');
        } else {
          expect(table).toBe('pop');
        }

        expect(item.buzz).toEqual({ S: 'Static string' });
      }

      expect(idsReturned.size).toBe(gets.length);
      expect(toBeFailed.size).toBe(0);

      const calls = mockDynamoDbClient.commandCalls(BatchGetItemCommand);
      expect(calls.length).toBe(Math.ceil(gets.length / MAX_READ_BATCH_SIZE));

      const callCount: Record<string, number> = calls
        .map(({ args: [{ input }] }) => input)
        .reduce((keyUseCount: Record<string, number>, { RequestItems }) => {
          const keys = [];
          for (const table of Object.keys(RequestItems)) {
            keys.push(...RequestItems[table].Keys!);
          }

          for (const {
            fizz: { N: key },
          } of keys) {
            if (key) {
              if (key in keyUseCount) {
                keyUseCount[key]++;
              } else {
                keyUseCount[key] = 1;
              }
            }
          }

          return keyUseCount;
        }, {});

      for (let i = 0; i < gets.length; i++) {
        expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
      }
    });
    // }
  });
});
