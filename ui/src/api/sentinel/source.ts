/**
 * The seam every phase of the wizard talks through, and the only place a
 * live Azure connection would ever be plugged in.
 */


/**
 * What a live implementation would exchange an interactive sign-in for.
 */
export interface TokenProvider {
  acquireToken: (scopes: readonly string[]) => Promise<string>
}

/** An authenticated session. Never persisted - `connectionConfig` stores the
 *  tenant/client/workspace coordinates, never a token. */
export interface ImporterSession {
  /** The signed-in account, display only. */
  identity: string
  /** Epoch seconds. Rendered, never enforced client-side. */
  expiresOn: number
}

/** One importable scope: a Sentinel workspace, and whatever the equivalent is
 *  elsewhere. */
export interface ImportSource {
  key: string
  name: string
  /** Secondary label, and the value the group filter matches. */
  group: string
  /** Provider coordinates, opaque to every component. */
  handle: Readonly<Record<string, string>>
}

export interface SourceListing {
  sources: readonly ImportSource[]
  groups: readonly string[]
  /** Scopes that could not be read at all. A caveat, not an error: a listing
   *  that is partially complete is still useful, silently short is not. */
  unavailable: number
}

/** The five filters the incidents phase offers. */
export interface IncidentFilter {
  severity: string
  status: string
  title: string
  number: string
  sinceHours: number
}

export interface RemoteIncident {
  key: string
  number: string
  title: string
  severity: string
  status: string
  /** Formatted for the table. `firstActivity` is the one compared. */
  created: string
  firstActivity: string
  description: string
  url: string
  provider: string
}

export interface RemoteAlert {
  key: string
  title: string
  severity: string
  /** ISO-8601 as the provider reported it; the server's mapper picks. */
  timeGenerated: string
  startTimeUtc: string
  tactics: readonly string[]
}

/**
 * One entity as the provider reports it, before any kind filtering.
 */
export interface RawEntity {
  kind: string
  id: string
  properties: Readonly<Record<string, string>>
}

export interface IncidentDetail {
  alerts: readonly RemoteAlert[]
  entities: readonly RawEntity[]
  /**
   * The provider's own payloads, unread.
   */
  raw: { alerts: readonly Record<string, unknown>[]; entities: readonly Record<string, unknown>[] }
  /** Alert key -> the entity ids linked to it. Sentinel's entities API is
   *  incident-wide, so every entity links to every alert - exact for a
   *  one-alert incident, over-linking otherwise. */
  alertEntityIds: Readonly<Record<string, readonly string[]>>
}

export interface IncidentPage {
  incidents: readonly RemoteIncident[]
  /** Where to resume, or null when the provider says there is no more. */
  cursor: string | null
}

export interface IncidentSource {
  /** The provider's own name, as the wizard's headings say it. */
  readonly name: string
  /** What the source phase is called in this provider's vocabulary. */
  readonly sourceNoun: string
  connect: () => Promise<ImporterSession>
  listSources: (session: ImporterSession) => Promise<SourceListing>
  listIncidents: (
    session: ImporterSession,
    source: ImportSource,
    filters: IncidentFilter,
    cursor: string | null,
  ) => Promise<IncidentPage>
  fetchDetail: (
    session: ImporterSession,
    source: ImportSource,
    incident: RemoteIncident,
  ) => Promise<IncidentDetail>
}

/**
 *  this app's: "Informational" is Sentinel's word, and `SEVERITY_MAP` in
 *  the server's `SEVERITY_MAP` turns it into the case's `info`. "Any" leads because
 */
export const SEVERITY_OPTIONS = ['Any', 'High', 'Medium', 'Low', 'Informational'] as const
export const STATUS_OPTIONS = ['Any', 'New', 'Active', 'Closed'] as const

/** The window dropdown's options. `0` is "Any time". */
export const TIME_WINDOWS: readonly { value: number; label: string }[] = [
  { value: 24, label: 'Last 24 hours' },
  { value: 24 * 7, label: 'Last 7 days' },
  { value: 24 * 30, label: 'Last 30 days' },
  { value: 0, label: 'Any time' },
]

export const DEFAULT_FILTER: IncidentFilter = {
  severity: 'Any',
  status: 'Any',
  title: '',
  number: '',
  // 0: no window until the analyst picks one. Defaulting to a week would hide
  // older incidents behind a filter nobody set.
  sinceHours: 0,
}

/**
 * What `listIncidents` would silently drop from these filters.
 */
export function filterWarning(filters: IncidentFilter): string {
  const number = filters.number.trim()
  if (number && !/^\d+$/.test(number)) return 'Incident ID must be a number; ignoring that filter'
  return ''
}
