import { marshall } from '@aws-sdk/util-dynamodb';
import { AttributePath } from '../src/AttributePath';
import {
  ExpressionAttributeNameMap,
  ExpressionAttributes,
  ExpressionAttributeValueMap,
} from '../src/ExpressionAttributes';
import { FunctionExpression } from '../src/FunctionExpression';
import { MathematicalExpression } from '../src/MathematicalExpression';

describe('MathematicalExpression', () => {
  const validExpressions: Array<
    [MathematicalExpression, string, ExpressionAttributeNameMap, ExpressionAttributeValueMap]
  > = [
    [
      new MathematicalExpression(new AttributePath('foo'), '+', 1),
      '#attr0 + :val1',
      { '#attr0': 'foo' },
      { ':val1': { N: '1' } },
    ],
    [
      new MathematicalExpression(
        new FunctionExpression('if_not_exists', new AttributePath('current_id'), 0),
        '+',
        1
      ),
      'if_not_exists(#attr0, :val1) + :val2',
      { '#attr0': 'current_id' },
      {
        ':val1': { N: '0' },
        ':val2': { N: '1' },
      },
    ],
  ];

  describe('::isMathematicalExpression', () => {
    it('should accept valid mathematical expressions', () => {
      for (const [expr] of validExpressions) {
        expect(MathematicalExpression.isMathematicalExpression(expr)).toBe(true);
      }
    });

    it('should reject non-matching values', () => {
      for (const notMathematicalExpression of [
        false,
        true,
        null,
        undefined,
        'string',
        123,
        [],
        {},
        new Uint8Array(12),
        { foo: 'bar' },
      ]) {
        expect(MathematicalExpression.isMathematicalExpression(notMathematicalExpression)).toBe(
          false
        );
      }
    });
  });

  describe('#serialize', () => {
    it('should serialize basic mathematical expressions', () => {
      for (const [expression, serialized, expectedNames, expectedValues] of validExpressions) {
        const attributes = new ExpressionAttributes();
        expect(expression.serialize(attributes)).toBe(serialized);
        expect(attributes.names).toEqual(expectedNames);
        expect(marshall(attributes.values)).toEqual(expectedValues);
      }
    });
  });
});
