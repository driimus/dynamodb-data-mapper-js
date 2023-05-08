import { versionAttribute } from '../src/versionAttribute';
import { attribute } from '../src/attribute';
import { Mock } from 'vitest';

vi.mock('../src/attribute', () => ({ attribute: vitest.fn() }));

describe('versionAttribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call attribute with a defined type and versionAttribute trait', () => {
    versionAttribute();

    expect((attribute as any).mock.calls.length).toBe(1);
    expect((attribute as any).mock.calls[0]).toEqual([
      {
        type: 'Number',
        versionAttribute: true,
      },
    ]);
  });

  it('should pass through any supplied parameters', () => {
    const attributeName = 'foo';
    versionAttribute({ attributeName });

    expect((attribute as Mock).mock.calls[0][0]).toMatchObject({
      attributeName,
    });
  });
});
