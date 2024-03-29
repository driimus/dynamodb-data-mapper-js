import type {
  AttributeTypeMap,
  BinaryType,
  CustomType,
  DateType,
  KeySchema,
  KeyTypeMap,
  NumberType,
  ScalarAttributeType,
  Schema,
  StringType,
} from './SchemaType';

export function keysFromSchema(schema: Schema): KeySchema {
  const attributes: AttributeTypeMap = {};
  const tableKeys: KeyTypeMap = {};
  const indexKeys: Record<string, KeyTypeMap> = {};

  for (const propertyName of Object.keys(schema)) {
    const fieldSchema = schema[propertyName];
    if (
      fieldSchema.type === 'Binary' ||
      fieldSchema.type === 'Custom' ||
      fieldSchema.type === 'Date' ||
      fieldSchema.type === 'Number' ||
      fieldSchema.type === 'String'
    ) {
      const { attributeName = propertyName, keyType, indexKeyConfigurations } = fieldSchema;

      if (keyType) {
        attributes[attributeName] = attributeType(fieldSchema);
        tableKeys[attributeName] = keyType;
      }

      if (indexKeyConfigurations && Object.keys(indexKeyConfigurations).length > 0) {
        attributes[attributeName] = attributeType(fieldSchema);

        for (const indexName of Object.keys(indexKeyConfigurations)) {
          if (!(indexName in indexKeys)) {
            indexKeys[indexName] = {};
          }

          indexKeys[indexName][attributeName] = indexKeyConfigurations[indexName];
        }
      }
    }
  }

  return { attributes, tableKeys, indexKeys };
}

function attributeType(
  fieldSchema: BinaryType | CustomType<any> | DateType | NumberType | StringType
): ScalarAttributeType {
  switch (fieldSchema.type) {
    case 'Binary': {
      return 'B';
    }
    case 'Custom': {
      if (!fieldSchema.attributeType) {
        throw new Error('Invalid schema: no attribute type defined for custom field');
      }

      return fieldSchema.attributeType;
    }
    case 'Date':
    case 'Number': {
      return 'N';
    }
    case 'String': {
      return 'S';
    }
    // No default
  }
}
