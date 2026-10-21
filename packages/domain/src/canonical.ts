/**
 * Canonical JSON (RFC 8785 style): object keys sorted by UTF-16 code units,
 * no insignificant whitespace, numbers and strings serialized exactly as
 * ECMAScript's JSON.stringify does. Hashing the result gives a value that
 * does not depend on key order (ADR-016).
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalize(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((v, i) => normalize(v, `${path}[${i}]`));
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = normalize(v, `${path}.${key}`);
    }
    return out;
  }
  throw new TypeError(`Unsupported value of type ${typeof value} at ${path}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, '$'));
}

/** Same ordering, indented for files people read and diff in Git. Ends with a newline. */
export function prettyCanonicalJson(value: unknown): string {
  return `${JSON.stringify(normalize(value, '$'), null, 2)}\n`;
}
