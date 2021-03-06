export const VERSION = '0.4.0';

export const MAX_WRITE_BATCH_SIZE = 25;

export const MAX_READ_BATCH_SIZE = 100;

export type OnMissingStrategy = 'remove' | 'skip';

export type ReadConsistency = 'eventual' | 'strong';

export type StringToAnyObjectMap = Record<string, any>;

export type SyncOrAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;

export type WriteType = 'put' | 'delete';
