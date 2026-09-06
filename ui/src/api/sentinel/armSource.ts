/**
 * The live `IncidentSource`: ARM queried from the browser, with the token the
 * browser holds.
 *
 * **The browser makes the call, not the server.** That is what lets core keep
 * the constitution's no-outbound-request rule while the plugin talks to Azure:
 * the bearer never reaches this app's own backend.
 *
 * ARM's CORS is not a risk to re-open: `Access-Control-Allow-Origin: *` with
 * `authorization` allowed was measured on the root, `/subscriptions` and the
 * `Microsoft.SecurityInsights/incidents` path.
 *
 * ## Two rules travel with the token, and both are about where it goes
 *
 * `nextLink` is response-controlled, so pagination is pinned to the ARM origin
 * rather than trusted - `assertArmUrl` refuses to attach the bearer to
 * anything else. A rate limit is honoured with a *clamped* `Retry-After`, for
 * the same reason: a server-controlled number that this code sleeps on.
 *
 * ## What this file is not
 *
 * It takes a `TokenProvider` and never acquires one. Signing in is the half
 * that needs an app registration and an interactive redirect; keeping it
 * outside means every query below is testable against a fake token, and the
 * sign-in can land without reopening any of this.
 */

import type {
  ImporterSession,
  ImportSource,
  IncidentDetail,
  IncidentFilter,
  IncidentPage,
  IncidentSource,
  RawEntity,
  RemoteAlert,
  RemoteIncident,
  SourceListing,
  TokenProvider,
} from './source'

export const ARM = 'https://management.azure.com'
export const ARM_SCOPE = `${ARM}/.default`

/** Four API versions, and they are not interchangeable. */
const TENANTS_API = '2022-12-01'
const SUBSCRIPTIONS_API = '2022-12-01'
const WORKSPACES_API = '2025-07-01'
const SENTINEL_API = '2025-09-01'

const MAX_RETRIES = 6
const DEFAULT_RETRY_AFTER = 5
const MAX_RETRY_AFTER = 60
const PAGE_SIZE = 50

/**
 * Refuse to send the ARM bearer anywhere but ARM.
 *
 * `nextLink` comes out of a response body, so a source that handed back a link
 * to its own host would be handed this browser's Azure token. Checked on
 * origin rather than a prefix: `https://management.azure.com.evil.test` starts
 * with the right string.
 */
export function assertArmUrl(url: string): void {
  let origin: string
  try {
    origin = new URL(url).origin
  } catch {
    throw new Error(`refusing to follow a link that is not a URL: ${url}`)
  }
  if (origin !== ARM) {
    throw new Error(`refusing to follow a link off ${ARM}: ${url}`)
  }
}

/**
 * Seconds to wait before retrying a 429 - clamped, and never throwing.
 *
 * Delta-seconds only. RFC 9110 also allows an HTTP-date, and rather than parse
 * one the default applies: being a few seconds out on a backoff is harmless,
 * where a parse error thrown from here reaches a caller that is catching
 * import failures and reads as the import failing.
 */
export function retryAfterSeconds(header: string | null): number {
  const seconds = Number.parseInt((header ?? '').trim(), 10)
  if (!Number.isFinite(seconds)) return DEFAULT_RETRY_AFTER
  return Math.max(0, Math.min(seconds, MAX_RETRY_AFTER))
}

/** Injected so tests do not spend the wait they are asserting about. */
export interface ArmSourceOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

async function armRequest(
  url: string, token: string, method: 'GET' | 'POST', options: ArmSourceOptions,
): Promise<Record<string, unknown>> {
  assertArmUrl(url)
  const doFetch = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? realSleep

  let response: Response | undefined
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      // A POST with an empty body: `alerts` and `entities` are POST-shaped
      // reads. Spread rather than `body: undefined`, which
      // `exactOptionalPropertyTypes` refuses - the key must be absent, not
      // present and undefined.
      response = await doFetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
      })
    } catch (thrown) {
      // A dropped connection mid-import is ordinary. It has to arrive as the
      // same kind of failure as a refusal, or it escapes the phase that is
      // catching them and the wizard shows nothing.
      throw new Error(`could not reach ${ARM}`, { cause: thrown })
    }
    if (response.status !== 429) break
    await sleep(retryAfterSeconds(response.headers.get('retry-after')) * 1000)
  }
  if (!response) throw new Error(`could not reach ${ARM}`)
  if (!response.ok) {
    throw new Error(`${ARM} refused with ${String(response.status)}: ${await response.text()}`)
  }
  const body = await response.text()
  if (!body) return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch (thrown) {
    throw new Error(`malformed JSON from ${ARM}`, { cause: thrown })
  }
}

function rows(body: Record<string, unknown>, key = 'value'): Record<string, unknown>[] {
  const value = body[key]
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

function str(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key]
  return typeof value === 'string' ? value : ''
}

function props(raw: Record<string, unknown>): Record<string, unknown> {
  const value = raw.properties
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** `'` doubled, which is OData's own escape. */
function odataEscape(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * The `$filter` these five controls compose, or null for no filter at all.
 *
 * **`createdTimeUtc`, not `firstActivityTimeUtc`.** The window an analyst
 * means is "raised during my shift"; first activity can predate that by days
 * on a slow detection, so filtering on it hides the incident they came in to
 * triage. Recomputed per query rather than captured when the screen loaded -
 * a relative window pinned to an instant narrows silently as the shift runs.
 *
 * A non-numeric incident id is dropped rather than sent: Sentinel rejects the
 * whole query on one, and `dialWarning` in `screens/import-sentinel.tsx` is
 * what says so out loud.
 */
export function odataFilter(filters: IncidentFilter, now: Date = new Date()): string | null {
  const clauses: string[] = []
  if (filters.severity && filters.severity !== 'Any') {
    clauses.push(`properties/severity eq '${odataEscape(filters.severity)}'`)
  }
  const number = filters.number.trim()
  if (number && /^\d+$/.test(number)) {
    clauses.push(`properties/incidentNumber eq ${number}`)
  }
  const title = filters.title.trim()
  if (title) clauses.push(`contains(properties/title,'${odataEscape(title)}')`)
  if (filters.status && filters.status !== 'Any') {
    clauses.push(`properties/status eq '${odataEscape(filters.status)}'`)
  }
  if (filters.sinceHours) {
    const since = new Date(now.getTime() - filters.sinceHours * 3600 * 1000)
    clauses.push(`properties/createdTimeUtc ge ${since.toISOString().slice(0, 19)}Z`)
  }
  return clauses.length ? clauses.join(' and ') : null
}

/** The incident table's own time format: `2026-08-03 09:14 UTC`. */
function formatIncidentTime(raw: string): string {
  if (!raw) return ''
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return `${parsed.toISOString().slice(0, 10)} ${parsed.toISOString().slice(11, 16)} UTC`
}

function toIncident(raw: Record<string, unknown>): RemoteIncident {
  const p = props(raw)
  const number = p.incidentNumber
  return {
    key: str(raw, 'name'),
    number: typeof number === 'number' || typeof number === 'string' ? String(number) : '?',
    title: str(p, 'title'),
    severity: str(p, 'severity'),
    status: str(p, 'status'),
    created: formatIncidentTime(str(p, 'createdTimeUtc')),
    firstActivity: str(p, 'firstActivityTimeUtc'),
    description: str(p, 'description'),
    url: str(p, 'incidentUrl'),
    provider: str(p, 'providerName'),
  }
}

function toAlert(raw: Record<string, unknown>): RemoteAlert {
  const p = props(raw)
  const tactics = p.tactics
  return {
    key: str(raw, 'id') || str(raw, 'name'),
    title: str(p, 'alertDisplayName') || str(p, 'displayName') || 'Alert',
    severity: str(p, 'severity'),
    timeGenerated: str(p, 'timeGenerated'),
    startTimeUtc: str(p, 'startTimeUtc'),
    tactics: Array.isArray(tactics) ? tactics.filter((t): t is string => typeof t === 'string') : [],
  }
}

/**
 * Every entity as reported, unfiltered by kind.
 *
 * `mapping.ts` drops the kinds this app has no table for; doing it here as
 * well would be two places deciding what is supported, and the one that ran
 * first would silently win.
 */
function toEntity(raw: Record<string, unknown>): RawEntity {
  const p = props(raw)
  const flat: Record<string, string> = {}
  for (const [name, value] of Object.entries(p)) {
    if (typeof value === 'string') flat[name] = value
  }
  return { kind: str(raw, 'kind'), id: str(raw, 'id') || str(raw, 'name'), properties: flat }
}

function sentinelBase(handle: Readonly<Record<string, string>>): string {
  // Every read off an index signature is `string | undefined`. Empty rather
  // than `undefined` in the path: ARM answers 404 for a malformed resource id,
  // where the string "undefined" would be a resource name it looked for.
  const part = (name: string) => handle[name] ?? ''
  return (
    `${ARM}/subscriptions/${part('subscriptionId')}` +
    `/resourceGroups/${part('resourceGroup')}` +
    `/providers/Microsoft.OperationalInsights/workspaces/${part('workspaceName')}` +
    `/providers/Microsoft.SecurityInsights`
  )
}

/** A workspace id carries its own subscription and resource group. */
function coordinatesOf(id: string): { subscriptionId: string; resourceGroup: string } {
  const parts = id.split('/')
  const at = (name: string): string => {
    const index = parts.findIndex((part) => part.toLowerCase() === name)
    return (index >= 0 ? parts[index + 1] : undefined) ?? ''
  }
  return { subscriptionId: at('subscriptions'), resourceGroup: at('resourcegroups') }
}

/**
 * The live source, given something that can produce an ARM token.
 *
 * `connect` asks the provider for one and reports the identity it names; every
 * other call asks again rather than caching, because the provider owns renewal
 * and a token cached here would be a second expiry to get wrong.
 */
export function armSource(
  tokens: TokenProvider, options: ArmSourceOptions = {},
): IncidentSource {
  const token = () => tokens.acquireToken([ARM_SCOPE])

  return {
    name: 'Microsoft Sentinel',
    sourceNoun: 'workspace',

    connect: async (): Promise<ImporterSession> => {
      const bearer = await token()
      const body = await armRequest(
        `${ARM}/tenants?api-version=${TENANTS_API}`, bearer, 'GET', options)
      const tenants = rows(body)
      // The token names the account; the tenant call is what proves it can
      // read ARM at all. A session that connects and then fails on the first
      // listing is the shape this avoids.
      return {
        identity: str(tenants[0], 'displayName') || 'signed in',
        expiresOn: 0,
      }
    },

    listSources: async (): Promise<SourceListing> => {
      const bearer = await token()
      const subs = rows(await armRequest(
        `${ARM}/subscriptions?api-version=${SUBSCRIPTIONS_API}`, bearer, 'GET', options))

      const sources: ImportSource[] = []
      const groups = new Set<string>()
      let unavailable = 0

      for (const sub of subs) {
        const subscriptionId = str(sub, 'subscriptionId')
        const group = str(sub, 'displayName') || subscriptionId
        if (!subscriptionId) continue
        let workspaces: Record<string, unknown>[]
        try {
          workspaces = rows(await armRequest(
            `${ARM}/subscriptions/${subscriptionId}` +
            `/providers/Microsoft.OperationalInsights/workspaces` +
            `?api-version=${WORKSPACES_API}`, bearer, 'GET', options))
        } catch {
          // A subscription this account cannot read is a caveat, not a
          // failure: the listing is still useful, and refusing the whole thing
          // because one of twenty is closed is worse than saying how many.
          unavailable += 1
          continue
        }
        groups.add(group)
        for (const workspace of workspaces) {
          const id = str(workspace, 'id')
          const { resourceGroup } = coordinatesOf(id)
          sources.push({
            key: id,
            name: str(workspace, 'name'),
            group,
            handle: { subscriptionId, resourceGroup, workspaceName: str(workspace, 'name') },
          })
        }
      }
      return { sources, groups: [...groups], unavailable }
    },

    listIncidents: async (
      _session: ImporterSession, source: ImportSource,
      filters: IncidentFilter, cursor: string | null,
    ): Promise<IncidentPage> => {
      const bearer = await token()
      let url: string
      if (cursor) {
        // The cursor is ARM's own `nextLink` and nothing here parses it: it
        // already carries `$skipToken`, the filter and the page size, so a
        // resumed page cannot drift from the first - which rebuilding the
        // query beside it would allow.
        url = cursor
      } else {
        url = `${sentinelBase(source.handle)}/incidents` +
          `?api-version=${SENTINEL_API}&$top=${String(PAGE_SIZE)}`
        const filter = odataFilter(filters)
        if (filter) url += `&$filter=${encodeURIComponent(filter)}`
      }
      const body = await armRequest(url, bearer, 'GET', options)
      const next = body.nextLink
      return {
        incidents: rows(body).map(toIncident),
        cursor: typeof next === 'string' && next ? next : null,
      }
    },

    fetchDetail: async (
      _session: ImporterSession, source: ImportSource, incident: RemoteIncident,
    ): Promise<IncidentDetail> => {
      const bearer = await token()
      const base = `${sentinelBase(source.handle)}/incidents/${encodeURIComponent(incident.key)}`
      const alertBody = await armRequest(
        `${base}/alerts?api-version=${SENTINEL_API}`, bearer, 'POST', options)
      const entityBody = await armRequest(
        `${base}/entities?api-version=${SENTINEL_API}`, bearer, 'POST', options)

      const alertRows = rows(alertBody)
      const entityRows = rows(entityBody, 'entities')
      const alerts = alertRows.map(toAlert)
      const entities = entityRows.map(toEntity)
      // Sentinel's entities API answers per *incident*, not per alert, so every
      // entity links to every alert - exact for a one-alert incident and
      // over-linking otherwise. The server-side importer says the same.
      const ids = entities.map((entity) => entity.id)
      const alertEntityIds: Record<string, readonly string[]> = {}
      for (const alert of alerts) alertEntityIds[alert.key] = ids
      return { alerts, entities, alertEntityIds, raw: { alerts: alertRows, entities: entityRows } }
    },
  }
}
