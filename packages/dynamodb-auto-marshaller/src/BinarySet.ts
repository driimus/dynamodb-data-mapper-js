import { ObjectSet } from './ObjectSet';

export type BinaryValue = ArrayBuffer | ArrayBufferView;

/**
 * A set of binary values represented as either ArrayBuffer objects or
 * ArrayBufferView objects. Equality is determined by the underlying byte
 * sequence and not by the identity or view window type of the provided value.
 */
export class BinarySet extends ObjectSet<BinaryValue> {
  /**
   * Creates a new BinarySet and optionally seeds it with values.
   *
   * @param iterable An optional iterable of values to add to the set.
   */
  constructor(iterable?: Iterable<BinaryValue>) {
    super(iterable);
    this.constructor = Set;
  }

  /**
   * Add a value to the set. If the value is already contained in the set, it
   * will not be added a second time.
   *
   * @remarks empty values will not be added to the set
   *
   * @param value The value to add
   */
  add(value: BinaryValue): this {
    if (value.byteLength > 0) super.add(value);

    return this;
  }

  delete(value: BinaryValue): boolean {
    const valueView = getBinaryView(value);
    const scrubbedValues = this._values.filter(
      (item) => !binaryEquals(getBinaryView(item), valueView)
    );

    const numberRemoved = this._values.length - scrubbedValues.length;
    this._values = scrubbedValues;

    return numberRemoved > 0;
  }

  /**
   * @inheritDoc
   *
   * Equality is determined by inspecting the bytes of the ArrayBuffer or
   * ArrayBufferView.
   *
   * @example On a little-endian system, the following values would be
   * considered equal:
   *
   *     new Uint32Array([0xdeadbeef]);
   *     (new Uint32Array([0xdeadbeef])).buffer;
   *     new Uint16Array([0xbeef, 0xdead]);
   *     new Uint8Array([0xef, 0xbe, 0xad, 0xde]);
   */
  has(value: BinaryValue): boolean {
    const valueView = getBinaryView(value);

    for (const item of this) {
      if (binaryEquals(getBinaryView(item), valueView)) {
        return true;
      }
    }

    return false;
  }
}

function binaryEquals(a: DataView, b: DataView): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }

  for (let i = 0; i < a.byteLength; i++) {
    if (a.getUint8(i) !== b.getUint8(i)) {
      return false;
    }
  }

  return true;
}

function getBinaryView(value: BinaryValue): DataView {
  return ArrayBuffer.isView(value)
    ? new DataView(value.buffer, value.byteOffset, value.byteLength)
    : new DataView(value);
}
