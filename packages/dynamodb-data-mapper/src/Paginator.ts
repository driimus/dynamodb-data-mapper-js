import type { AttributeMap, Schema, ZeroArgumentsConstructor } from '@aws/dynamodb-data-marshaller';
import { unmarshallItem } from '@aws/dynamodb-data-marshaller';
import type { DynamoDbPaginatorInterface } from '@aws/dynamodb-query-iterator';
import type { ConsumedCapacity } from '@aws-sdk/client-dynamodb';

import { getSchema } from './protocols';

export abstract class Paginator<T> implements AsyncIterableIterator<T[]> {
  private readonly itemSchema: Schema;
  private lastKey?: T;
  private lastResolved: Promise<IteratorResult<T[]>> = Promise.resolve() as any;

  protected constructor(
    private readonly paginator: DynamoDbPaginatorInterface,
    private readonly valueConstructor: ZeroArgumentsConstructor<T>
  ) {
    this.itemSchema = getSchema(valueConstructor.prototype);
  }

  /**
   * @inheritDoc
   */
  [Symbol.asyncIterator]() {
    return this;
  }

  /**
   * @inheritDoc
   */
  async next(): Promise<IteratorResult<T[]>> {
    this.lastResolved = this.lastResolved.then(async () => this.getNext());
    return this.lastResolved;
  }

  /**
   * @inheritDoc
   */
  async return(): Promise<IteratorResult<T[]>> {
    // Prevent any further use of this iterator
    this.lastResolved = Promise.reject(
      new Error('Iteration has been manually interrupted and may not be resumed')
    );
    this.lastResolved.catch(() => {});

    return this.paginator.return() as Promise<IteratorResult<T[]>>;
  }

  /**
   * Retrieve the reported capacity consumed by this paginator. Will be
   * undefined unless returned consumed capacity is requested.
   */
  get consumedCapacity(): ConsumedCapacity | undefined {
    return this.paginator.consumedCapacity;
  }

  /**
   * Retrieve the number of items yielded thus far by this paginator.
   */
  get count() {
    return this.paginator.count;
  }

  /**
   * Retrieve the last reported `LastEvaluatedKey`, unmarshalled according to
   * the schema used by this paginator.
   */
  get lastEvaluatedKey(): Partial<T> | undefined {
    return this.lastKey;
  }

  /**
   * Retrieve the number of items scanned thus far during the execution of
   * this paginator. This number should be the same as {@link count} unless a
   * filter expression was used.
   */
  get scannedCount() {
    return this.paginator.scannedCount;
  }

  private async getNext(): Promise<IteratorResult<T[]>> {
    return this.paginator.next().then(({ value = {}, done }) => {
      if (!done) {
        this.lastKey =
          value.LastEvaluatedKey &&
          unmarshallItem(this.itemSchema, value.LastEvaluatedKey, this.valueConstructor);

        return {
          value: ((value.Items as AttributeMap[]) || []).map((item) =>
            unmarshallItem(this.itemSchema, item, this.valueConstructor)
          ),
          done: false,
        };
      }

      return { done: true } as IteratorResult<T[]>;
    });
  }
}
