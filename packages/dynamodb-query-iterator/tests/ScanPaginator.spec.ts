import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { ScanPaginator } from '../src';

describe('ScanPaginator', () => {
  const promiseFunc = vitest.fn();
  const mockDynamoDbClient = mockClient(DynamoDBClient);

  beforeEach(() => {
    mockDynamoDbClient.reset();
    mockDynamoDbClient.on(ScanCommand).callsFake(promiseFunc);
    // PromiseFunc.mockClear();
    //     promiseFunc.mockImplementation(() => Promise.resolve({Items: []}));
    //     mockDynamoDbClient.scan.mockClear();
    //     mockDynamoDbClient.scan.mockImplementation(() => {
    //         return {promise: promiseFunc};
    //     });
  });

  it('should paginate over results and return a promise for each item', async () => {
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
        LastEvaluatedKey: { fizz: { S: 'pop' } },
      })
    );
    promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

    const result: any[] = [];
    for await (const scanResult of new ScanPaginator(
      mockDynamoDbClient as unknown as DynamoDBClient,
      {
        TableName: 'foo',
      }
    )) {
      result.push(...(scanResult.Items ?? []));
    }

    expect(result).toEqual([
      {
        fizz: { S: 'snap' },
        bar: { NS: ['1', '2', '3'] },
        baz: { L: [{ BOOL: true }, { N: '4' }] },
      },
      {
        fizz: { S: 'crackle' },
        bar: { NS: ['5', '6', '7'] },
        baz: { L: [{ BOOL: false }, { N: '8' }] },
      },
      {
        fizz: { S: 'pop' },
        bar: { NS: ['9', '12', '30'] },
        baz: { L: [{ BOOL: true }, { N: '24' }] },
      },
    ]);
  });

  it('should provide access to the last evaluated key', async () => {
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
        LastEvaluatedKey: { fizz: { S: 'pop' } },
      })
    );
    promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

    const paginator = new ScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
    });
    const expectedLastKeys = [
      { fizz: { S: 'snap' } },
      { fizz: { S: 'crackle' } },
      { fizz: { S: 'pop' } },
    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of paginator) {
      expect(paginator.lastEvaluatedKey).toEqual(expectedLastKeys.shift());
    }

    expect(paginator.lastEvaluatedKey).toBeUndefined();
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

    const paginator = new ScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
    });

    let expectedCount = 0;
    const expectedScanCounts = [1, 3, 6];
    expect(paginator.count).toBe(expectedCount);
    expect(paginator.scannedCount).toBe(expectedCount);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of paginator) {
      expect(paginator.count).toBe(++expectedCount);
      expect(paginator.scannedCount).toBe(expectedScanCounts.shift()!);
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

    const paginator = new ScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
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

  it('should report the last evaluated key even after ceasing iteration', async () => {
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
        LastEvaluatedKey: { fizz: { S: 'pop' } },
      })
    );
    promiseFunc.mockImplementationOnce(async () => Promise.resolve({}));

    let i = 0;
    const paginator = new ScanPaginator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of paginator) {
      if (++i > 1) {
        break;
      }
    }

    expect(paginator.lastEvaluatedKey).toEqual({ fizz: { S: 'crackle' } });
  });
});
