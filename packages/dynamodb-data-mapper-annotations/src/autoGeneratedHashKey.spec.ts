import { randomUUID } from 'node:crypto';
import { autoGeneratedHashKey } from './autoGeneratedHashKey';
import { attribute } from './attribute';

jest.mock('./attribute', () => ({ attribute: jest.fn() }));

describe('autoGeneratedHashKey', () => {
  beforeEach(() => {
    (attribute as any).mockClear();
  });

  it('should call attribute with a defined type, keyType, and defaultProvider', () => {
    autoGeneratedHashKey();

    expect((attribute as any).mock.calls.length).toBe(1);
    expect((attribute as any).mock.calls[0]).toEqual([
      {
        type: 'String',
        keyType: 'HASH',
        defaultProvider: randomUUID,
      },
    ]);
  });

  it('should pass through any supplied parameters', () => {
    const attributeName = 'foo';
    autoGeneratedHashKey({ attributeName });

    expect((attribute as any).mock.calls[0][0]).toMatchObject({
      attributeName,
    });
  });
});
