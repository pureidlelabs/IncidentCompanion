/**
 * A value the type system lost track of, as text -- or nothing.
 */
export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
