import type { AttributePath } from './AttributePath';
import type { ExpressionAttributes } from './ExpressionAttributes';

/**
 * An array of attributes to project. Each may be represented as
 * either an AttributePath object or as a string.
 */
export type ProjectionExpression = Array<AttributePath | string>;

/**
 * Convert the supplied projection expression to the string format
 * expected by DynamoDB, substituting all attribute paths using the
 * provided ExpressionAttributes object.
 */
export function serializeProjectionExpression(
  projection: ProjectionExpression,
  attributes: ExpressionAttributes
): string {
  const serialized: string[] = [];
  for (const projected of projection) {
    serialized.push(attributes.addName(projected));
  }

  return serialized.join(', ');
}
