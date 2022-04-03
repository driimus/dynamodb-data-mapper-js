import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { ScanIterator } from '.';

describe('ScanIterator', () => {
  const promiseFunc = jest.fn();
  const mockDynamoDbClient = mockClient(DynamoDBClient);

  beforeEach(() => {
    mockDynamoDbClient.reset();
    mockDynamoDbClient.on(ScanCommand).callsFake(promiseFunc);
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
    for await (const item of new ScanIterator(mockDynamoDbClient as unknown as DynamoDBClient, {
      TableName: 'foo',
    })) {
      result.push(item);
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

  it('should provide access to paginator metadata', async () => {
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
        Count: 1,
        ScannedCount: 2,
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
        Count: 1,
        ScannedCount: 3,
        ConsumedCapacity: {
          TableName: 'foo',
          CapacityUnits: 2,
        },
      })
    );

    const iterator = new ScanIterator(mockDynamoDbClient as unknown as DynamoDBClient, {
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
});
