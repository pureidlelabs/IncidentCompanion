/**
 * The wire speaks snake_case; the schemas speak camelCase.
 */

/** `event_source` -> `eventSource`. Leaves an already-camel key alone. */
export function toCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

/**
 * Rewrite every key in a JSON body.
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
