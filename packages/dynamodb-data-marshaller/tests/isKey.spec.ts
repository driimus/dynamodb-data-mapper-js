import { isKey } from '../src/isKey';
import { SchemaType, TypeTag } from '../src/SchemaType';

const keyableTypes: TypeTag[] = ['Binary', 'Custom', 'Date', 'Number', 'String'];

const unkeyableTypes: TypeTag[] = [
  'Any',
  'Boolean',
  'Collection',
  'Document',
  'Hash',
  'List',
  'Map',
  'Null',
  'Set',
  'Tuple',
];

describe('isKey', () => {
  it.each(unkeyableTypes)(
    'should return false if the field is of type $notKeyType',
    (notKeyType) => {
      expect(isKey({ type: notKeyType, keyType: 'HASH' } as SchemaType)).toBe(false);
    }
  );

  it.each(keyableTypes)('should return false if the field is of type $keyType', (keyType) => {
    expect(isKey({ type: keyType, keyType: 'HASH' } as SchemaType)).toBe(true);
  });

  it('should return true if the field is an index key and the index name was supplied', () => {
    expect(isKey({ type: 'String', indexKeyConfigurations: { foo: 'HASH' } }, 'foo')).toBe(true);
  });

  it('should return false if the field is an index key and no index name was supplied', () => {
    expect(isKey({ type: 'String', indexKeyConfigurations: { foo: 'HASH' } })).toBe(false);
  });

  it('should return false if the field is an index key and a different index name was supplied', () => {
    expect(isKey({ type: 'String', indexKeyConfigurations: { foo: 'HASH' } }, 'bar')).toBe(false);
  });

  it('should return false if the field is a table key and an index name was supplied', () => {
    expect(isKey({ type: 'String', keyType: 'HASH' }, 'foo')).toBe(false);
  });

  it('should return true if the field is both a table and an index key', () => {
    expect(
      isKey(
        {
          type: 'String',
          keyType: 'HASH',
          indexKeyConfigurations: { foo: 'HASH' },
        },
        'foo'
      )
    ).toBe(true);
  });
});
