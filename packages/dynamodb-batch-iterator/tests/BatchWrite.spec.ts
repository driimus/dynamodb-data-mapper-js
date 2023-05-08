import {
  BatchWriteItemCommand,
  BatchWriteItemOutput,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { BatchWrite, MAX_WRITE_BATCH_SIZE } from '../src/BatchWrite';
import { WriteRequest } from '../src/types';
import { mockClient } from 'aws-sdk-client-mock';

describe('BatchWrite', () => {
  const promiseFunc = vitest.fn(async () =>
    Promise.resolve({
      UnprocessedItems: {},
    } as BatchWriteItemOutput)
  );
  const mockDynamoDbClient = mockClient(DynamoDBClient);
  mockDynamoDbClient.on(BatchWriteItemCommand).callsFake(promiseFunc);

  // Const mockDynamoDbClient = {
  //     config: {},
  //     batchWriteItem: vitest.fn(() => ({ promise: promiseFunc })),
  // };

  beforeEach(() => {
    promiseFunc.mockClear();
    mockDynamoDbClient.resetHistory();
    // MockDynamoDbClient.batchWriteItem.mockClear();
  });

  it('should return itself when its Symbol.asyncIterator method is called', () => {
    const batchWrite = new BatchWrite({} as any, []);
    expect(batchWrite[Symbol.asyncIterator]()).toBe(batchWrite);
  });

  describe.each([true, false])('should', (asyncInput) => {
    // For (const asyncInput of [true, false]) {
    it(`partition write batches into requests with ${MAX_WRITE_BATCH_SIZE} or fewer items`, async () => {
      const writes: Array<[string, WriteRequest]> = [];
      const expected: any = [
        [
          {
            RequestItems: {
              snap: [],
              crackle: [],
              pop: [],
            },
          },
        ],
        [
          {
            RequestItems: {
              snap: [],
              crackle: [],
              pop: [],
            },
          },
        ],
        [
          {
            RequestItems: {
              snap: [],
              crackle: [],
              pop: [],
            },
          },
        ],
        [
          {
            RequestItems: {
              snap: [],
              crackle: [],
              pop: [],
            },
          },
        ],
      ];

      for (let i = 0; i < 80; i++) {
        const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
        const fizz = { N: String(i) };
        const request: WriteRequest =
          i % 2 === 0 ? { DeleteRequest: { Key: { fizz } } } : { PutRequest: { Item: { fizz } } };
        writes.push([table, request]);
        expected[Math.floor(i / MAX_WRITE_BATCH_SIZE)][0].RequestItems[table].push(request);
      }

      const input = asyncInput
        ? (async function* () {
            for (const item of writes) {
              await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
              yield item;
            }
          })()
        : writes;

      for await (const [tableName, request] of new BatchWrite(
        mockDynamoDbClient as unknown as DynamoDBClient,
        input
      )) {
        const id = request.DeleteRequest
          ? parseInt(request.DeleteRequest.Key!.fizz.N as string)
          : parseInt((request.PutRequest as any).Item.fizz.N as string);

        if (id % 3 === 0) {
          expect(tableName).toBe('snap');
        } else if (id % 3 === 1) {
          expect(tableName).toBe('crackle');
        } else {
          expect(tableName).toBe('pop');
        }
      }

      // Const { calls } = mockDynamoDbClient.batchWriteItem.mock;
      const calls = mockDynamoDbClient.commandCalls(BatchWriteItemCommand);

      expect(calls.length).toBe(Math.ceil(writes.length / MAX_WRITE_BATCH_SIZE));
      expect(calls.map(({ args: [{ input }] }) => [input])).toEqual(expected);
    });

    it('retry unprocessed items', async () => {
      const failures = new Set(['21', '24', '38', '43', '55', '60']);
      const writes: Array<[string, WriteRequest]> = [];
      const unprocessed = new Map<string, WriteRequest>();

      for (let i = 0; i < 80; i++) {
        const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
        const fizz = { N: String(i) };
        const request: WriteRequest =
          i % 2 === 0
            ? { DeleteRequest: { Key: { fizz } } }
            : {
                PutRequest: {
                  Item: {
                    fizz,
                    // buzz: {B: new ArrayBuffer(3)},
                    pop: { B: Uint8Array.from([i]) },
                    // foo: {B: String.fromCharCode(i + 32)},
                    quux: { S: 'string' },
                  },
                },
              };
        writes.push([table, request]);

        if (failures.has(fizz.N)) {
          unprocessed.set(fizz.N, request);
        }
      }

      promiseFunc.mockImplementation(async () => {
        const response: BatchWriteItemOutput = {};

        const { RequestItems = {} } = mockDynamoDbClient
          .commandCalls(BatchWriteItemCommand)
          .slice(-1)[0].args[0].input;
        for (const tableName of Object.keys(RequestItems)) {
          for (const { DeleteRequest, PutRequest } of RequestItems[tableName]) {
            const item = DeleteRequest ? DeleteRequest.Key : PutRequest?.Item;
            if (unprocessed.has(item.fizz.N)) {
              if (!response.UnprocessedItems) {
                response.UnprocessedItems = {};
              }

              if (!(tableName in response.UnprocessedItems)) {
                response.UnprocessedItems[tableName] = [];
              }

              response.UnprocessedItems[tableName].push(
                unprocessed.get(item.fizz.N) as Record<string, unknown>
              );
              unprocessed.delete(item.fizz.N);
            }
          }
        }

        return response;
      });

      const input = asyncInput
        ? (async function* () {
            for (const item of writes) {
              await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
              yield item;
            }
          })()
        : writes;

      const seen = new Set<number>();
      for await (const [tableName, request] of new BatchWrite(
        mockDynamoDbClient as unknown as DynamoDBClient,
        input
      )) {
        const id = request.DeleteRequest
          ? parseInt(request.DeleteRequest.Key!.fizz.N as string)
          : parseInt((request.PutRequest as any).Item.fizz.N as string);

        expect(seen.has(id)).toBe(false);
        seen.add(id);

        if (id % 3 === 0) {
          expect(tableName).toBe('snap');
        } else if (id % 3 === 1) {
          expect(tableName).toBe('crackle');
        } else {
          expect(tableName).toBe('pop');
        }
      }

      expect(seen.size).toBe(writes.length);

      const calls = mockDynamoDbClient.commandCalls(BatchWriteItemCommand);
      expect(calls.length).toBe(Math.ceil(writes.length / MAX_WRITE_BATCH_SIZE));

      const callCount: Record<string, number> = calls
        .map(({ args: [{ input }] }) => input)
        .reduce((keyUseCount: Record<string, number>, { RequestItems }) => {
          for (const table of Object.keys(RequestItems)) {
            for (const { PutRequest, DeleteRequest } of RequestItems[table]) {
              const key = DeleteRequest
                ? DeleteRequest.Key!.fizz.N
                : (PutRequest as any).Item.fizz.N;
              if (key in keyUseCount) {
                keyUseCount[key]++;
              } else {
                keyUseCount[key] = 1;
              }
            }
          }

          return keyUseCount;
        }, {});

      for (let i = 0; i < writes.length; i++) {
        expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
      }
    });
    // }
  });
});
