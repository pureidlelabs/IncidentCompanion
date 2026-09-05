/**
 * Everything a write may announce it touched, as a plain list.
 */

/**
 * Every scope, snake_case, as the route and the change feed spell it.
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
 */
export function isScope(value: string): value is (typeof SCOPES)[number] {
  return (SCOPES as readonly string[]).includes(value)
}
