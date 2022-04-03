import type { AttributeBearingExpression } from './AttributeBearingExpression';
import { AttributePath } from './AttributePath';
import type { ExpressionAttributes } from './ExpressionAttributes';

const FUNCTION_EXPRESSION_TAG = 'AmazonDynamoDbFunctionExpression';
const EXPECTED_TOSTRING = `[object ${FUNCTION_EXPRESSION_TAG}]`;

/**
 * An object representing a DynamoDB function expression.
 */
export class FunctionExpression implements AttributeBearingExpression {
  /**
   * Evaluate whether the provided value is a FunctionExpression object.
   */
  static isFunctionExpression(arg: any): arg is FunctionExpression {
    return (
      arg instanceof FunctionExpression || Object.prototype.toString.call(arg) === EXPECTED_TOSTRING
    );
  }

  readonly [Symbol.toStringTag] = FUNCTION_EXPRESSION_TAG;
  readonly args: Array<AttributePath | any>;

  constructor(readonly name: string, ...args: Array<AttributePath | any>) {
    this.args = args;
  }

  serialize(attributes: ExpressionAttributes) {
    const expressionSafeArgs: string[] = this.args.map((arg) => {
      if (AttributePath.isAttributePath(arg)) {
        return attributes.addName(arg);
      }

      if (FunctionExpression.isFunctionExpression(arg)) {
        return arg.serialize(attributes);
      }

      return attributes.addValue(arg);
    });

    return `${this.name}(${expressionSafeArgs.join(', ')})`;
  }
}
