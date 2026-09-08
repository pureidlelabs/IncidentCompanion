/**
 * Whether a database error is "the row you referenced is not there" -- Postgres
 * `23503`, matched on the code and looked for down the `cause` chain, since
 * Drizzle wraps the driver's error.
 *
 * **The install has no exception filter**, so a code that reaches the framework
 * unread is a 500. A caller naming a row that was deleted is told the
 * installation broke, which is the failure this exists to let a route refuse
 * instead.
 */
export function isMissingParent(error: unknown): boolean {
  for (let at = error, hops = 0; at && hops < 5; at = (at as { cause?: unknown }).cause, hops++) {
    if ((at as { code?: unknown }).code === '23503') return true
  }
  return false
}
