import type { ConsumedCapacity } from '@aws-sdk/client-dynamodb';

import type { DynamoDbPaginatorInterface } from './DynamoDbPaginatorInterface';
import type { AttributeMap } from './DynamoDbResultsPage';

if (Symbol && !Symbol.asyncIterator) {
  (Symbol as any).asyncIterator = Symbol.for('__@@asyncIterator__');
}

export abstract class ItemIterator<Paginator extends DynamoDbPaginatorInterface>
  implements AsyncIterableIterator<AttributeMap>
{
  private _iteratedCount = 0;
  private lastResolved: Promise<IteratorResult<AttributeMap>> = Promise.resolve({
    done: false,
    value: {},
  });

  private readonly pending: AttributeMap[] = [];

  protected constructor(private readonly paginator: Paginator) {}

  /**
   * @inheritDoc
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<AttributeMap> {
    return this;
  }

  /**
   * The capacity units consumed by the Scan operation. The data returned
   * includes the total provisioned throughput consumed, along with statistics
   * for the table and any indexes involved in the operation. ConsumedCapacity
   * is only returned if the ReturnConsumedCapacity parameter was specified.
   */
  get consumedCapacity(): ConsumedCapacity | undefined {
    return this.paginator.consumedCapacity;
  }

  /**
   * The number of items that have been iterated over.
   */
  get count(): number {
    return this._iteratedCount;
  }

  /**
   * @inheritDoc
   */
  async next(): Promise<IteratorResult<AttributeMap>> {
    this.lastResolved = this.lastResolved.then(async () => this.getNext());
    return this.lastResolved;
  }

  /**
   * Detaches the underlying paginator from this iterator and returns it. The
   * paginator will yield arrays of unmarshalled items, with each yielded
   * array corresponding to a single call to the underlying API. As with the
   * underlying API, pages may contain a variable number of items or no items,
   * in which case an empty array will be yielded.
   *
   * Calling this method will disable further iteration.
   */
  pages(): Paginator {
    // Prevent the iterator from being used further and squelch any uncaught
    // promise rejection warnings
    this.lastResolved = Promise.reject(
      new Error('The underlying paginator has been detached from this iterator.')
    );
    this.lastResolved.catch(() => {});

    return this.paginator;
  }

  /**
   * @inheritDoc
   */
  async return(): Promise<IteratorResult<AttributeMap>> {
    // Prevent any further use of this iterator
    this.lastResolved = Promise.reject(
      new Error('Iteration has been manually interrupted and may not be resumed')
    );
    this.lastResolved.catch(() => {});

    // Clear the pending queue to free up memory
    this.pending.length = 0;
    await this.paginator.return();

    return doneSigil();
  }

  /**
   * The number of items evaluated, before any ScanFilter is applied. A high
   * scannedCount value with few, or no, Count results indicates an
   * inefficient Scan operation. For more information, see Count and
   * ScannedCount in the Amazon DynamoDB Developer Guide.
   */
  get scannedCount(): number {
    return this.paginator.scannedCount;
  }

  private async getNext(): Promise<IteratorResult<AttributeMap>> {
    if (this.pending.length > 0) {
      this._iteratedCount++;
      return {
        value: this.pending.shift()!,
        done: false,
      };
    }

    const nextResult = await this.paginator.next();
    if (nextResult.done) {
      return doneSigil();
    }

    this.pending.push(...(nextResult.value.Items ?? []));
    return this.getNext();
  }
}

function doneSigil(): IteratorResult<any> {
  return { done: true, value: undefined };
}
