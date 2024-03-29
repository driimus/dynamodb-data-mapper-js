import { rangeKey } from '../src/rangeKey';
import { attribute } from '../src/attribute';

vitest.mock('../src/attribute', () => ({ attribute: vitest.fn() }));

describe('rangeKey', () => {
  beforeEach(() => {
    (attribute as any).mockClear();
  });

  it('should call attribute with a defined keyType', () => {
    rangeKey();

    expect((attribute as any).mock.calls.length).toBe(1);
    expect((attribute as any).mock.calls[0]).toEqual([{ keyType: 'RANGE' }]);
  });

  it('should pass through any supplied parameters', () => {
    const attributeName = 'foo';
    rangeKey({ attributeName });

    expect((attribute as any).mock.calls[0][0]).toMatchObject({
      attributeName,
    });
  });
});
