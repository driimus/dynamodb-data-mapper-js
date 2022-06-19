import type { Schema, ZeroArgumentsConstructor } from '@driimus/dynamodb-data-marshaller';

export type BatchState<T> = Record<
  string,
  {
    keyProperties: string[];
    itemSchemata: Record<
      string,
      {
        schema: Schema;
        constructor: ZeroArgumentsConstructor<T>;
      }
    >;
  }
>;
