import type { Schema } from 'ddb-data-marshaller';

import type { GetOptions } from './GetOptions';
import type { ReadConsistencyConfiguration } from './ReadConsistencyConfiguration';

export interface BatchGetOptions extends ReadConsistencyConfiguration {
  /**
   * Options to apply to specific tables when performing a batch get operation
   * that reads from multiple tables.
   */
  perTableOptions?: Record<string, BatchGetTableOptions>;
}

export interface BatchGetTableOptions extends GetOptions {
  /**
   * The schema to use when mapping the supplied `projection` option to the
   * attribute names used in DynamoDB.
   *
   * This parameter is only necessary if a batch contains items from multiple
   * classes that map to the *same* table using *different* property names to
   * represent the same DynamoDB attributes.
   *
   * If not supplied, the schema associated with the first item associated
   * with a given table will be used in its place.
   */
  projectionSchema?: Schema;
}
