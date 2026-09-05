/**
 * snake_case on the wire, camelCase in TypeScript - converted here and in no
 * other file.
 *
 * Generic rather than a generated lookup table: a table would have to be
 * regenerated before a new Python field could be read at all, and the failure
 * would be a silently missing value rather than a type error. The round trip
 * is proved over the real 167-name field list in `naming.test.ts`, which is
 * what a generic converter owes.
 */

export function toCamel(wire: string): string {
  return wire.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
}

export function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function convertKeys(value: unknown, key: (name: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, key))
  if (value === null || typeof value !== 'object') return value
  // Date, File and friends pass through whole: rewriting their keys would
  // turn an object the fetch layer knows how to send into a plain bag.
  if (value.constructor !== Object) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([name, inner]) => [
      key(name),
      convertKeys(inner, key),
    ]),
  )
}

/** A response body, as the UI spells it.
 *
 * The type parameter is the caller's assertion about a shape the wire does not
 * describe - every API response schema is empty - so it appears once by
 * design rather than by omission.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function fromWire<T>(body: unknown): T {
  return convertKeys(body, toCamel) as T
}

/** A request body, as the API spells it. */
export function toWire(body: Record<string, unknown>): Json {
  return convertKeys(body, toSnake) as Json
}
