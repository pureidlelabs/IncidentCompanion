/**
 * The wire speaks snake_case; the schemas speak camelCase. Only requests are
 * converted - responses already leave as camelCase, and the client's
 * `fromWire` camelises what is already camel to itself.
 */

/** `event_source` -> `eventSource`. Leaves an already-camel key alone. */
export function toCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Rewrite every key in a JSON body.
 *
 * **Arrays keep their elements and non-plain objects pass through whole.** A
 * `Date` or a `File` reaching here would be rebuilt as a bare bag of its own
 * properties, which is the mistake the client's version documents; nothing
 * constructs one before validation, and the guard costs nothing.
 */
export function camelKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelKeys)
  if (value === null || typeof value !== 'object') return value
  if (value.constructor !== Object) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
      toCamel(key),
      camelKeys(inner),
    ]),
  )
}
