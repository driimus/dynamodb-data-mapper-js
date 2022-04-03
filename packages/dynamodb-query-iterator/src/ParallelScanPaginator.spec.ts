import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { ParallelScanPaginator } from '.';

describe('ParallelScanPaginator', () => {
  const promiseFunc = jest.fn();
  const mockDynamoDbClient = mockClient(DynamoDBClient);

  beforeEach(() => {
    promiseFunc.mockClear();
    mockDynamoDbClient.reset();
    promiseFunc.mockImplementation(async () => Promise.resolve({ Items: [] }));
    mockDynamoDbClient.on(ScanCommand).callsFake(promiseFunc);
  });

  it('should execute multiple requests in parallel when performing a scan with multiple segments', async () => {
    const segments = 2;
    const keys = ['snap', 'crackle', 'pop', 'foo', 'bar', 'baz'];
    let index = 0;

    // Ensure that the first promise won't resolve immediately. This
    // would block progress on a sequential scan but should pose no
    // problem for a parallel one.
    promiseFunc.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          setTimeout(
            resolve.bind(null, {
              Items: [
                {
                  fizz: { S: 'quux' },
                  bar: { NS: ['5', '12', '13'] },
                  baz: { L: [{ BOOL: true }, { N: '101' }] },
                },
              ],
            }),
            50
          );
        })
    );

    // Enqueue a number of responses that will resolve synchronously
    for (const key of keys) {
      const response = Promise.resolve({
        Items: [
          {
            fizz: { S: key },
            bar: {
              NS: [(++index).toString(10), (++index).toString(10)],
            },
            baz: {
              L: [{ BOOL: index % 2 === 0 }, { N: (++index).toString(10) }],
            },
          },
        ],
        LastEvaluatedKey: { fizz: { S: key } },
      });
      promiseFunc.mockImplementationOnce(async () => response);
    }

    // Enqueue a final page for this segment
    promiseFunc.mockImplementationOnce(async () => Promise.resolve({ Items: [] }));

    const result: any[] = [];
    for await (const scanResult of new ParallelScanPaginator(
      mockDynamoDbClient as unknown as DynamoDBClient,
      {
        TableName: 'foo',
        TotalSegments: segments,
      }
    )) {
      result.push(scanResult);
    }

    expect(result).toEqual([
      {
        Items: [
          {
            fizz: { S: 'snap' },
            bar: { NS: ['1', '2'] },
            baz: { L: [{ BOOL: true }, { N: '3' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'snap' } },
      },
      {
        Items: [
          {
            fizz: { S: 'crackle' },
            bar: { NS: ['4', '5'] },
            baz: { L: [{ BOOL: false }, { N: '6' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'crackle' } },
      },
      {
        Items: [
          {
            fizz: { S: 'pop' },
            bar: { NS: ['7', '8'] },
            baz: { L: [{ BOOL: true }, { N: '9' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'pop' } },
      },
      {
        Items: [
          {
            fizz: { S: 'foo' },
            bar: { NS: ['10', '11'] },
            baz: { L: [{ BOOL: false }, { N: '12' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'foo' } },
      },
      {
        Items: [
          {
            fizz: { S: 'bar' },
            bar: { NS: ['13', '14'] },
            baz: { L: [{ BOOL: true }, { N: '15' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'bar' } },
      },
      {
        Items: [
          {
            fizz: { S: 'baz' },
            bar: { NS: ['16', '17'] },
            baz: { L: [{ BOOL: false }, { N: '18' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'baz' } },
      },
      {
        Items: [],
      },
      {
        Items: [
          {
            fizz: { S: 'quux' },
            bar: { NS: ['5', '12', '13'] },
            baz: { L: [{ BOOL: true }, { N: '101' }] },
          },
        ],
      },
    ]);
  });

  it('should merge counts', async () => {
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'snap' },
            bar: { NS: ['1', '2', '3'] },
            baz: { L: [{ BOOL: true }, { N: '4' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'snap' } },
        Count: 1,
        ScannedCount: 1,
      })
    );
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'crackle' },
            bar: { NS: ['5', '6', '7'] },
            baz: { L: [{ BOOL: false }, { N: '8' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'crackle' } },
        Count: 1,
        ScannedCount: 2,
      })
    );
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'pop' },
            bar: { NS: ['9', '12', '30'] },
            baz: { L: [{ BOOL: true }, { N: '24' }] },
          },
        ],
        Count: 1,
        ScannedCount: 3,
      })
    );

    const paginator = new ParallelScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
      TotalSegments: 2,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of paginator) {
      // Pass
    }

    expect(paginator.count).toBe(3);
    expect(paginator.scannedCount).toBe(6);
  });

  it('should merge consumed capacity reports', async () => {
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'snap' },
            bar: { NS: ['1', '2', '3'] },
            baz: { L: [{ BOOL: true }, { N: '4' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'snap' } },
        ConsumedCapacity: {
          TableName: 'foo',
          CapacityUnits: 2,
        },
      })
    );
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'crackle' },
            bar: { NS: ['5', '6', '7'] },
            baz: { L: [{ BOOL: false }, { N: '8' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'crackle' } },
        ConsumedCapacity: {
          TableName: 'foo',
          CapacityUnits: 2,
        },
      })
    );
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'pop' },
            bar: { NS: ['9', '12', '30'] },
            baz: { L: [{ BOOL: true }, { N: '24' }] },
          },
        ],
        ConsumedCapacity: {
          TableName: 'foo',
          CapacityUnits: 2,
        },
      })
    );

    const paginator = new ParallelScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
      TotalSegments: 2,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of paginator) {
      // Pass
    }

    expect(paginator.consumedCapacity).toMatchObject({
      TableName: 'foo',
      CapacityUnits: 6,
    });
  });

  it('should report the scan state even after ceasing iteration', async () => {
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'snap' },
            bar: { NS: ['1', '2', '3'] },
            baz: { L: [{ BOOL: true }, { N: '4' }] },
          },
        ],
        LastEvaluatedKey: { fizz: { S: 'snap' } },
      })
    );

    const paginator = new ParallelScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
      TotalSegments: 1,
    });

    await paginator.next();

    expect(paginator.scanState).toEqual([
      {
        initialized: true,
        LastEvaluatedKey: { fizz: { S: 'snap' } },
      },
    ]);
  });

  it('should resume pagination when given a state object', async () => {
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'crackle' },
            bar: { NS: ['5', '6', '7'] },
            baz: { L: [{ BOOL: false }, { N: '8' }] },
          },
        ],
      })
    );

    const paginator = new ParallelScanPaginator(
      mockDynamoDbClient as unknown as DynamoDBClient,
      {
        TableName: 'foo',
        TotalSegments: 1,
      },
      [
        {
          initialized: true,
          LastEvaluatedKey: { fizz: { S: 'snap' } },
        },
      ]
    );

    await paginator.next();

    expect(mockDynamoDbClient.commandCalls(ScanCommand)).toHaveLength(1);
    expect(
      mockDynamoDbClient.commandCalls(ScanCommand, {
        TableName: 'foo',
        ExclusiveStartKey: { fizz: { S: 'snap' } },
        Segment: 0,
        TotalSegments: 1,
      })
    ).toHaveLength(1);
  });

  it('should yield nothing when given a finished state object', async () => {
    promiseFunc.mockImplementationOnce(async () =>
      Promise.resolve({
        Items: [
          {
            fizz: { S: 'crackle' },
            bar: { NS: ['5', '6', '7'] },
            baz: { L: [{ BOOL: false }, { N: '8' }] },
          },
        ],
      })
    );

    const paginator = new ParallelScanPaginator(
      mockDynamoDbClient as unknown as DynamoDBClient,
      {
        TableName: 'foo',
        TotalSegments: 1,
      },
      [{ initialized: true }]
    );

    // eslint-disable-next-line no-unreachable-loop, @typescript-eslint/no-unused-vars
    for await (const _ of paginator) {
      throw new Error('This block should never have been entered');
    }
  });

  it('should throw when a parallel scan paginator is created with a scan state with the wrong number of segments', () => {
    expect(
      () =>
        new ParallelScanPaginator(
          mockDynamoDbClient as unknown as DynamoDBClient,
          {
            TableName: 'foo',
            TotalSegments: 1,
          },
          [
            {
              initialized: true,
              LastEvaluatedKey: { fizz: { S: 'snap' } },
            },
            {
              initialized: true,
              LastEvaluatedKey: { fizz: { S: 'crackle' } },
            },
          ]
        )
    ).toThrow();
  });
});
