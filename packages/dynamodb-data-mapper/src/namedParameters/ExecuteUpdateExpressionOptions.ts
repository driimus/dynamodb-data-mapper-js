import type { ConditionExpression } from 'ddb-expressions';

export interface ExecuteUpdateExpressionOptions {
  /**
   * A condition on which this update operation's completion will be
   * predicated.
   */
  condition?: ConditionExpression;
}
