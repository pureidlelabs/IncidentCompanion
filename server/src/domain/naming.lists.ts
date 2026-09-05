/**
 * How a name that needs a qualifier is written, wherever it is shown.
 */

/** `name` when there is no qualifier, `name (qualifier)` when there is. */
export function qualified(name: string, qualifier: string): string {
  const tail = qualifier.trim()
  return tail ? `${name} (${tail})` : name
}
