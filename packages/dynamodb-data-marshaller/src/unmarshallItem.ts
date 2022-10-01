import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { AttributeMap } from '@driimus/dynamodb-auto-marshaller';
import { BinarySet, Marshaller } from '@driimus/dynamodb-auto-marshaller';

import { InvalidSchemaError } from './InvalidSchemaError';
import type {
  ListType,
  MapType,
  Schema,
  SchemaType,
  TupleType,
  ZeroArgumentsConstructor,
} from './SchemaType';

export type AttributeValueList = AttributeValue[];

export type StringAttributeValue = string;
export type StringSetAttributeValue = StringAttributeValue[];

export type NumberAttributeValue = string;
export type NumberSetAttributeValue = NumberAttributeValue[];

/**
 * Unmarshall a DynamoDB item into a JavaScript value.
 *
 * @param schema            Metadata outlining the types to be expected
 *                          throughout the input
 * @param input             The value to unmarshall
 * @param valueConstructor  A zero-argument constructor used to create the
 *                          object onto which the input should be unmarshalled
 */
export function unmarshallItem<T extends Record<string, unknown> = Record<string, unknown>>(
  schema: Schema,
  input: AttributeMap,
  ValueConstructor?: ZeroArgumentsConstructor<T>
): T {
  const unmarshalled = ValueConstructor ? new ValueConstructor() : ({} as Record<string, unknown>);

  for (const key of Object.keys(schema)) {
    const { attributeName = key } = schema[key];
    if (attributeName in input) {
      unmarshalled[key] = unmarshallValue(schema[key], input[attributeName]);
    }
  }

  return unmarshalled as T;
}

function unmarshallValue(schemaType: SchemaType, input: AttributeValue): unknown {
  switch (schemaType.type) {
    case 'Any':
    case 'Collection':
    case 'Hash': {
      const { onEmpty = 'leave', onInvalid = 'throw', unwrapNumbers = false } = schemaType;
      const autoMarshaller = new Marshaller({
        onEmpty,
        onInvalid,
        unwrapNumbers,
      });
      return autoMarshaller.unmarshallValue(input);
    }

    case 'Binary': {
      if (input.NULL) {
        return new Uint8Array(0);
      }

      return input.B;
    }
    case 'Boolean': {
      return input.BOOL;
    }
    case 'Custom': {
      return schemaType.unmarshall(input);
    }
    case 'Date': {
      return input.N ? new Date(Number(input.N) * 1000) : undefined;
    }
    case 'Document': {
      return input.M
        ? unmarshallItem(schemaType.members, input.M, schemaType.valueConstructor)
        : undefined;
    }
    case 'List': {
      return input.L ? unmarshallList(schemaType, input.L) : undefined;
    }
    case 'Map': {
      return input.M ? unmarshallMap(schemaType, input.M) : undefined;
    }
    case 'Null': {
      return input.NULL ? null : undefined;
    }
    case 'Number': {
      return typeof input.N === 'string' ? Number(input.N) : undefined;
    }
    case 'Set': {
      switch (schemaType.memberType) {
        case 'Binary': {
          if (input.NULL) {
            return new BinarySet();
          }

          return typeof input.BS === 'undefined' ? undefined : new BinarySet(input.BS);
        }
        case 'Number': {
          if (input.NULL) {
            return new Set<number>();
          }

          return input.NS ? unmarshallNumberSet(input.NS) : undefined;
        }
        case 'String': {
          if (input.NULL) {
            return new Set<string>();
          }

          return input.SS ? unmarshallStringSet(input.SS) : undefined;
        }
        default: {
          throw new InvalidSchemaError(
            schemaType,
            `Unrecognized set member type: ${(schemaType as Record<string, string>)?.memberType}`
          );
        }
      }
    }

    case 'String': {
      return input.NULL ? '' : input.S;
    }
    case 'Tuple': {
      return input.L ? unmarshallTuple(schemaType, input.L) : undefined;
    }
    // No default
  }

  throw new InvalidSchemaError(schemaType, 'Unrecognized schema node');
}

function unmarshallList(schemaType: ListType, input: AttributeValueList): any[] {
  const list: any[] = [];
  for (const element of input) {
    list.push(unmarshallValue(schemaType.memberType, element));
  }

  return list;
}

function unmarshallMap(schemaType: MapType, input: AttributeMap): Map<string, any> {
  const map = new Map<string, any>();
  for (const key of Object.keys(input)) {
    map.set(key, unmarshallValue(schemaType.memberType, input[key]));
  }

  return map;
}

function unmarshallNumberSet(input: NumberSetAttributeValue): Set<number> {
  const set = new Set<number>();
  for (const number of input) {
    set.add(Number(number));
  }

  return set;
}

function unmarshallStringSet(input: StringSetAttributeValue): Set<string> {
  const set = new Set<string>();
  for (const string of input) {
    set.add(string);
  }

  return set;
}

function unmarshallTuple(schemaType: TupleType, input: AttributeValueList): any[] {
  const { members } = schemaType;
  const tuple: any[] = [];
  for (const [i, member] of members.entries()) {
    tuple.push(unmarshallValue(member, input[i]));
  }

  return tuple;
}
