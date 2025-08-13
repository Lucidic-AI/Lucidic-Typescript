import { inspect } from 'node:util';
import type { JsonValue } from '../client/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function truncateString(input: string, maxLen: number): string {
  if (input.length <= maxLen) return input;
  return input.slice(0, maxLen) + '…';
}

function stringifyFallback(value: unknown, maxStringLength: number): string {
  try {
    const str = inspect(value, {
      depth: 2,
      maxArrayLength: 50,
      breakLength: 120,
      showProxy: false,
      maxStringLength: maxStringLength,
      compact: 3,
    });
    return truncateString(String(str), maxStringLength);
  } catch {
    return truncateString(String(value), maxStringLength);
  }
}

export function toJsonSafe(value: unknown, options: { maxStringLength?: number } = {}): JsonValue {
  const { maxStringLength = 4096 } = options;

  const seen = new WeakSet<object>();

  function inner(val: unknown): JsonValue {
    // Primitives
    if (val === null) return null;
    if (typeof val === 'string') return truncateString(val, maxStringLength);
    if (typeof val === 'boolean') return val;
    if (isFiniteNumber(val)) return val;
    if (typeof val === 'number') return String(val) as unknown as JsonValue; // NaN/Infinity -> string fallback

    // BigInt -> string fallback
    if (typeof val === 'bigint') return `${val.toString()}n`;

    // Undefined -> string fallback
    if (typeof val === 'undefined') return 'undefined';

    // Functions / Symbols -> string fallback
    if (typeof val === 'function') return stringifyFallback(val, maxStringLength);
    if (typeof val === 'symbol') return String(val);

    // Dates / RegExp / Errors -> string fallback (with helpful format)
    if (val instanceof Date) return truncateString(val.toISOString(), maxStringLength);
    if (val instanceof RegExp) return String(val);
    if (val instanceof Error) return truncateString(`${val.name}: ${val.message}`, maxStringLength);

    // Arrays
    if (Array.isArray(val)) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
      return val.map(inner) as unknown as JsonValue;
    }

    // Objects
    if (typeof val === 'object' && val !== null) {
      // Buffers / Typed arrays / DataView -> string fallback
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) {
        return `Buffer(length=${(val as Buffer).length})`;
      }
      const tag = Object.prototype.toString.call(val);
      if (tag.includes('ArrayBuffer') || tag.includes('TypedArray') || tag.includes('DataView')) {
        // e.g., [object Uint8Array]
        const ctor = (val as any)?.constructor?.name ?? 'TypedArray';
        const length = (val as any)?.length ?? 0;
        return `${ctor}(length=${length})`;
      }
      // Map/Set -> string fallback
      if (val instanceof Map) return `Map(size=${val.size})`;
      if (val instanceof Set) return `Set(size=${val.size})`;

      // Only traverse plain objects; otherwise fallback to a string summary
      if (!isPlainObject(val)) return stringifyFallback(val, maxStringLength);

      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
      const out: Record<string, JsonValue> = {};
      for (const key of Object.keys(val as Record<string, unknown>)) {
        out[key] = inner((val as Record<string, unknown>)[key]);
      }
      return out as JsonValue;
    }

    // Fallback catch-all
    return stringifyFallback(val, maxStringLength);
  }

  return inner(value);
}

export function mapJsonStrings(value: JsonValue, transform: (s: string) => string): JsonValue {
  if (value === null) return null;
  if (typeof value === 'string') return transform(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(v => mapJsonStrings(v as JsonValue, transform)) as JsonValue;
  const obj = value as Record<string, JsonValue>;
  const out: Record<string, JsonValue> = {};
  for (const k of Object.keys(obj)) {
    out[k] = mapJsonStrings(obj[k], transform);
  }
  return out as JsonValue;
}


