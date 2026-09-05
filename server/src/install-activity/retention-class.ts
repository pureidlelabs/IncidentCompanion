/**
 * Which retention window a line falls under.
 */
import type { InstallEvent } from './record.js'

export const RETENTION_CLASSES = ['audit', 'operational'] as const
export type RetentionClass = (typeof RETENTION_CLASSES)[number]

/**
 * The lines that are volume rather than evidence.
 */
const OPERATIONAL: ReadonlySet<string> = new Set<string>([
  'install_started',
  'api_called',
  'case_opened_live',
  'rate_limited',
])

export function retentionClassOf(event: InstallEvent): RetentionClass {
  return OPERATIONAL.has(event) ? 'operational' : 'audit'
}
