import { AttributePath } from 'ddb-expressions';

import type { Schema, SchemaType } from './SchemaType';

export function toSchemaName(path: AttributePath | string, schema: Schema): AttributePath {
  if (typeof path === 'string') {
    path = new AttributePath(path);
  }

  const elements = path.elements.map((element) => ({ ...element }));

  let cursor: SchemaType = {
    type: 'Document',
    members: schema,
  };
  for (const element of elements) {
    if (element.type === 'AttributeName' && cursor && cursor.type === 'Document') {
      const { name } = element;
      element.name = getSchemaName(name, cursor.members);
      cursor = cursor.members[name];
    } else if (element.type === 'ListIndex' && cursor && cursor.type === 'List') {
      cursor = cursor.memberType;
    } else {
      break;
    }
  }

  return new AttributePath(elements);
}

export function getSchemaName(propertyName: string, schema: Schema): string {
  const fieldSchema = schema[propertyName];
  if (fieldSchema) {
    const { attributeName = propertyName } = fieldSchema;
    return attributeName;
  }

  return propertyName;
}
