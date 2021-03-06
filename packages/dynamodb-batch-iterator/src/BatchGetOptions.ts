import type { ConsistentRead, ExpressionAttributeNameMap, ProjectionExpression } from './types';

export interface BatchGetOptions {
  /**
   * The default read consistency to apply to gets.
   */
  ConsistentRead?: ConsistentRead;

  /**
   * Options to apply for all reads directed to a specific table.
   */
  PerTableOptions?: PerTableOptions;
}

export type PerTableOptions = Record<string, TableOptions>;

export interface TableOptions {
  /**
   * The read consistency to apply to reads against this table.
   */
  ConsistentRead?: ConsistentRead;

  /**
   * One or more substitution tokens for attribute names in an expression.
   */
  ExpressionAttributeNames?: ExpressionAttributeNameMap;

  /**
   * A string that identifies one or more attributes to retrieve from the
   * table.
   */
  ProjectionExpression?: ProjectionExpression;
}
