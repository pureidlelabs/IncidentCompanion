/**
 * What `GET /api/health` says, turned into what an analyst needs to do.
 *
 * The consequence, never the dependency's name: "Redis is down" is a fact
 * about the server room, "you will not see other analysts' changes" is what
 * changes what they do next.
 *
 * The server's reason is deliberately dropped: it is a closed set of seven
 * strings for whoever is fixing the install, and gives an analyst nothing
 * to act on. It stays in the response for the person reading it with `curl`.
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
  readonly key: string
  readonly name: string
  /** What the analyst loses. Absent where nobody has written it down yet. */
  readonly consequence?: string | undefined
}

/**
 * What each dependency costs the analyst when it is unreachable.
 *
 * A dependency with no entry still produces a line, rather than a probe
 * added later failing silently into an empty banner.
 */
const CONSEQUENCE: Record<string, string> = {
  postgres: 'Nothing can be loaded or saved.',
  redis: "Other analysts' changes and their presence will not appear.",
}

export const DEPENDENCY: Record<string, string> = {
  postgres: 'The database',
  redis: 'The live channel',
}

/** `postgres` -> `Postgres`, for a probe added later than this map. */
function named(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

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
