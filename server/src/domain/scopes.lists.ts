/**
 * Everything a write may announce it touched, as a plain list.
 *
 * `wire.ts` derives the `Scope` union from this and proves the two agree in
 * both directions. It lives apart because `wire.ts` is type-only -- the client
 * value-imports this module to check a scope that arrived over the socket, and
 * a value export from `wire.ts` would put every schema beside it in the
 * browser bundle.
 *
 * **This file imports nothing, and that is its whole contract.**
 * `scopes.lists.test.ts` asserts it.
 */

/**
 * Every scope, snake_case, as the route and the change feed spell it.
 *
 * **The last two are not collections.** A case's own scalars and its
 * compliance record are written through their own routes and keyed outside the
 * collection convention, so each needs a branch that says so in one place.
 */
export const SCOPES = [
  'timeline',
  'systems',
  'accounts',
  'malware',
  'network_indicators',
  'impact',
  'cloud_apps',
  'evidence',
  'methods',
  'actions',
  'casenotes',
  'reports',
  'report_blocks',
  'cases',
  'case_compliance',
] as const

/**
 * Whether a string the database or the wire produced is a scope at all.
 *
 * A conflict row holds the collection it was raised against as a database
 * column, and an announce arrives at the client as a bare string. Both are a
 * validation rather than a cast: a value the union does not have is dropped,
 * where a cast produces a query key nothing reads.
 */
export function isScope(value: string): value is (typeof SCOPES)[number] {
  return (SCOPES as readonly string[]).includes(value)
}
