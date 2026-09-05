/**
 * What `GET /api/health` says, turned into what an analyst needs to do.
 */

/** One dependency's verdict, as Terminus reports it. */
export interface DependencyState {
  status: string
  message?: string
}

/** The subset of Terminus' envelope this app reads. */
export interface HealthReport {
  status: 'ok' | 'error' | 'shutting_down'
  error?: Record<string, DependencyState>
  /** Every dependency, well or not -- `error` holds only the unwell ones. */
  details?: Record<string, DependencyState>
}

export interface Trouble {
  /** The dependency's key, so a caller can list them stably. */
  readonly key: string
  /** What it is called on screen, for the heading. */
  readonly name: string
  /** What the analyst loses. Absent where nobody has written it down yet. */
  readonly consequence?: string | undefined
}

/**
 * What each dependency costs the analyst when it is unreachable.
 */
const CONSEQUENCE: Record<string, string> = {
  postgres: 'Nothing can be loaded or saved.',
  redis: "Other analysts' changes and their presence will not appear.",
}

/** What each dependency is called on screen. */
export const DEPENDENCY: Record<string, string> = {
  postgres: 'The database',
  redis: 'The live channel',
}

/** `postgres` -> `Postgres`, for a probe added later than this map. */
function named(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/** Empty when all is well; one entry per dependency that is not. */
export function troubles(report: HealthReport | undefined): Trouble[] {
  if (!report || report.status === 'ok') return []
  return Object.keys(report.error ?? {})
    .sort()
    .map((key) => ({
      key,
      name: DEPENDENCY[key] ?? named(key),
      consequence: CONSEQUENCE[key],
    }))
}

/** The banner's heading, which names what is down rather than reading the
 *  same for every failure. */
export function troubleHeading(wrong: readonly Trouble[]): string {
  const names = wrong.map((one) => one.name)
  if (names.length === 0) return 'Parts of the app are not working'
  if (names.length === 1) return `${names[0] ?? ''} is not responding`
  const last = names[names.length - 1] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${last.toLowerCase()} are not responding`
}

/** A shutdown is not a fault: Terminus answers `shutting_down` while the
 *  process closes its pool, an orderly stop rather than a broken
 *  dependency. */
export function isStopping(report: HealthReport | undefined): boolean {
  return report?.status === 'shutting_down'
}
