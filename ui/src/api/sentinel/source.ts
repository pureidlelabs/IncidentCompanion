/**
 * The seam every phase of the wizard talks through, and the only place a
 * live Azure connection would ever be plugged in.
 *
 * Four calls: `connect`, `listSources`, `listIncidents` (a page plus an opaque
 * cursor) and `fetchDetail`. The browser would hold the bearer token and make
 * the outbound call, so the server keeps its no-outbound rule and Azure
 * credentials never reach it.
 *
 * **Two implementations ship.** `armSource.ts` is the live one -- PKCE SPA
 * sign-in through `msalTokenProvider`, against the ARM origins the CSP allows
 * -- and `fixtureSource.ts` answers from the bundle, which is what tests,
 * stories and `?importer=demo` drive. A component takes an
 * `IncidentSource | null`, and `null` is the honest state the Connect phase
 * renders before a tenant and client id have been given.
 *
 * **The cursor is opaque and nothing here parses it.** ARM's `nextLink`
 * already carries the skip token, the filter and the page size, so a resumed
 * page cannot drift from the first - which rebuilding the query beside it
 * would allow.
 *
 * `handle` and `raw` stay the provider's own: the UI passes them back
 * untouched and only the implementation that produced them reads them.
 */


/**
 * What a live implementation would exchange an interactive sign-in for.
 *
 * Kept as its own interface rather than folded into `IncidentSource` because
 * it is the half that is genuinely Azure's: a token for a scope. The query
 * half above it is ordinary HTTP against ARM and needs nothing but the string.
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
 *
 * `properties` stays a flat string map: the mapper reads `hostName`,
 * `accountName`, `upnSuffix`, `address`, `hashValue`, `appName` and friends,
 * and a typed union per kind would be nine interfaces asserting what the
 * server's own mapping already checks. The kinds are the server's list, not
 * this tier's.
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
   *
   * **What the server maps from.** The normalised shapes above are what the
   * review list *displays*; they are lossy by construction -- `RawEntity`
   * types its properties as strings, which discards every `Int`, `Bool`, list
   * and nested entity the provider sends. Mapping happens where the schemas
   * are, so the payload crosses this seam the way the protocol always said it
   * should: opaque, and read only by the thing that produced it.
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

export const DEFAULT_FILTER: IncidentFilter = {
  severity: 'Any',
  status: 'Any',
  title: '',
  number: '',
  // 0: no window until the analyst picks one. Defaulting to a week would hide
  // older incidents behind a filter nobody set.
  sinceHours: 0,
}
