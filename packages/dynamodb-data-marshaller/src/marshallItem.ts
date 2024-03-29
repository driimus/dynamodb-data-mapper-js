import { Buffer } from 'node:buffer';

import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { BinaryValue } from '@driimus/dynamodb-auto-marshaller';
import { BinarySet, Marshaller } from '@driimus/dynamodb-auto-marshaller';

import { InvalidSchemaError } from './InvalidSchemaError';
import { InvalidValueError } from './InvalidValueError';
import type { Schema, SchemaType } from './SchemaType';

export type AttributeMap = Record<string, AttributeValue>;
/**
 * Converts a JavaScript object into a DynamoDB Item.
 *
 * @param schema Metadata explaining how the provided input is to be marshalled
 * @param input JavaScript object to convert
 */
export function marshallItem(schema: Schema, input: Record<string, unknown>): AttributeMap {
  const marshalled: AttributeMap = {};

  for (const key of Object.keys(schema)) {
    const value = input[key];
    const { attributeName = key } = schema[key];
    const marshalledValue = marshallValue(schema[key], value);
    if (marshalledValue) {
      marshalled[attributeName] = marshalledValue;
    }
  }

  return marshalled;
}

/**
 * Converts a value into a DynamoDB AttributeValue.
 *
 * @param schemaType    Metadata outlining how the value is to be understood and
 *                      converted
 * @param input         Value to convert
 */
export function marshallValue(schemaType: SchemaType, input: any): AttributeValue | undefined {
  if (input === undefined) {
    const { defaultProvider } = schemaType;
    if (typeof defaultProvider === 'function') {
      input = defaultProvider();
    } else {
      return undefined;
    }
  }

  if (schemaType.type === 'Any') {
    const { onEmpty = 'nullify', onInvalid = 'omit', unwrapNumbers = false } = schemaType;
    const marshaller = new Marshaller({
      onEmpty,
      onInvalid,
      unwrapNumbers,
    });
    return marshaller.marshallValue(input);
  }

  if (schemaType.type === 'Binary') {
    if (!input || input.length === 0 || input.byteLength === 0) {
      return { NULL: true };
    }

    return { B: marshallBinary(input) };
  }

  if (schemaType.type === 'Boolean') {
    return { BOOL: Boolean(input) };
  }

  if (schemaType.type === 'Custom') {
    return schemaType.marshall(input);
  }

  if (schemaType.type === 'Collection') {
    const { onEmpty = 'nullify', onInvalid = 'omit', unwrapNumbers = false } = schemaType;
    const marshaller = new Marshaller({
      onEmpty,
      onInvalid,
      unwrapNumbers,
    });

    const collected: AttributeValue[] = [];
    for (const element of input) {
      const marshalled = marshaller.marshallValue(element);
      if (marshalled) {
        collected.push(marshalled);
      }
    }

    return { L: collected };
  }

  if (schemaType.type === 'Date') {
    let date: Date;
    if (typeof input === 'string') {
      date = new Date(input);
    } else if (typeof input === 'number') {
      date = new Date(input * 1000);
    } else if (isDate(input)) {
      date = input;
    } else {
      throw new InvalidValueError(input, 'Unable to convert value to date');
    }

    return { N: marshallNumber(Math.floor(date.valueOf() / 1000)) };
  }

  if (schemaType.type === 'Document') {
    return { M: marshallItem(schemaType.members, input) };
  }

  if (schemaType.type === 'Hash') {
    const { onEmpty = 'nullify', onInvalid = 'omit', unwrapNumbers = false } = schemaType;
    const marshaller = new Marshaller({
      onEmpty,
      onInvalid,
      unwrapNumbers,
    });

    return { M: marshaller.marshallItem(input) };
  }

  if (schemaType.type === 'List') {
    const elements = [];
    for (const member of input) {
      const marshalled = marshallValue(schemaType.memberType, member);
      if (marshalled) {
        elements.push(marshalled);
      }
    }

    return { L: elements };
  }

  if (schemaType.type === 'Map') {
    const marshalled: AttributeMap = {};
    if (typeof input[Symbol.iterator] === 'function') {
      for (const [key, value] of input) {
        const marshalledValue = marshallValue(schemaType.memberType, value);
        if (marshalledValue) {
          marshalled[key] = marshalledValue;
        }
      }
    } else if (typeof input === 'object') {
      for (const key of Object.keys(input)) {
        const marshalledValue = marshallValue(schemaType.memberType, input[key]);
        if (marshalledValue) {
          marshalled[key] = marshalledValue;
        }
      }
    } else {
      throw new InvalidValueError(input, 'Unable to convert value to map');
    }

    return { M: marshalled };
  }

  if (schemaType.type === 'Null') {
    return { NULL: true };
  }

  if (schemaType.type === 'Number') {
    return { N: marshallNumber(input) };
  }

  if (schemaType.type === 'Set') {
    if (schemaType.memberType === 'Binary') {
      // TODO: #212 marshalling entries should always occur
      if (!(input instanceof BinarySet)) {
        const set = new BinarySet();
        for (const item of input) {
          set.add(marshallBinary(item));
        }

        input = set;
      }

      return marshallSet(input, marshallBinary, (bin: BinaryValue) => bin.byteLength === 0, 'BS');
    }

    if (schemaType.memberType === 'Number') {
      if (!(input instanceof Set)) input = new Set(input);

      return marshallSet(input, marshallNumber, () => false, 'NS');
    }

    if (schemaType.memberType === 'String') {
      if (!(input instanceof Set)) input = new Set<string>(input);

      return marshallSet(input, marshallString, (string: string) => string.length === 0, 'SS');
    }

    throw new InvalidSchemaError(
      schemaType,
      `Unrecognized set member type: ${schemaType.memberType as string}`
    );
  }

  if (schemaType.type === 'String') {
    const string = marshallString(input);
    if (string.length === 0) {
      return { NULL: true };
    }

    return { S: string };
  }

  if (schemaType.type === 'Tuple') {
    return {
      L: schemaType.members
        .map((type: SchemaType, index: number) => marshallValue(type, input[index]))
        .filter((value): value is AttributeValue => value !== undefined),
    };
  }

  throw new InvalidSchemaError(schemaType, 'Unrecognized schema node');
}

function marshallBinary(input: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  if (isArrayBuffer(input)) {
    return new Uint8Array(input);
  }

  return new Uint8Array(Buffer.from(input).toJSON().data);
}

function marshallNumber(input: number): string {
  return input.toString(10);
}

function marshallString(input: { toString(): string }): string {
  return input.toString();
}

function marshallSet<InputType, MarshalledElementType>(
  value: Iterable<InputType>,
  marshaller: (element: InputType) => MarshalledElementType,
  isEmpty: (member: MarshalledElementType) => boolean,
  setTag: 'BS' | 'NS' | 'SS'
): AttributeValue {
  const collected: Array<MarshalledElementType> = [];
  for (const member of value) {
    const marshalled = marshaller(member);
    if (isEmpty(marshalled)) {
      // DynamoDB sets cannot contain empty values
      continue;
    }

    collected.push(marshalled);
  }

  if (collected.length === 0) {
    return { NULL: true };
  }

  return { [setTag]: collected } as unknown as AttributeValue;
}

function isArrayBuffer(arg: any): arg is ArrayBuffer {
  return (
    typeof ArrayBuffer === 'function' &&
    (arg instanceof ArrayBuffer || Object.prototype.toString.call(arg) === '[object ArrayBuffer]')
  );
}

function isDate(arg: any): arg is Date {
  return arg instanceof Date || Object.prototype.toString.call(arg) === '[object Date]';
}
