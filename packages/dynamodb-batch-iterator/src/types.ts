import type {
  AttributeValue,
  DeleteRequest,
  PutRequest,
  WriteRequest as DynamoDbWriteRequest,
} from '@aws-sdk/client-dynamodb';

export type AttributeMap = Record<string, AttributeValue>;
export type ProjectionExpression = string;
export type AttributeName = string;
export type ExpressionAttributeNameMap = Record<string, AttributeName>;
export type ConsistentRead = boolean;

/**
 * A synchronous or asynchronous iterable.
 */
export type SyncOrAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;

/**
 * @internal
 */
export type BatchState<Element extends TableStateElement> = Record<string, TableState<Element>>;

/**
 * @internal
 */
export interface TableState<Element extends TableStateElement> {
  attributeNames?: ExpressionAttributeNameMap;
  backoffFactor: number;
  consistentRead?: ConsistentRead;
  name: string;
  projection?: ProjectionExpression;
  tableThrottling?: TableThrottlingTracker<Element>;
}

/**
 * @internal
 */
export type TableStateElement = AttributeMap | WriteRequest;

/**
 * @internal
 */
export interface TableThrottlingTracker<Element extends TableStateElement> {
  backoffWaiter: Promise<ThrottledTableConfiguration<Element>>;
  unprocessed: Element[];
}

/**
 * @internal
 */
export interface ThrottledTableConfiguration<Element extends TableStateElement>
  extends TableState<Element> {
  tableThrottling?: TableThrottlingTracker<Element>;
}

/**
 * A write request for which exactly one of the `PutRequest` and `DeleteRequest`
 * properties has been defined.
 */
export type WriteRequest =
  | (DynamoDbWriteRequest & { PutRequest: PutRequest; DeleteRequest?: undefined })
  | (DynamoDbWriteRequest & { DeleteRequest: DeleteRequest; PutRequest?: undefined });
