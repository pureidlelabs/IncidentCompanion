/**
 * The seam's fixture implementation: invented incidents, no network, no token.
 *
 * **Every name here is fabricated** - the tenants, the workspaces, the
 * hostnames, the accounts and the domains. `example.invalid` and the
 * RFC 5737 documentation ranges are reserved by definition, so nothing in
 * this file can resolve to, or be mistaken for, a real organisation's estate.
 * The same rule the demo cases follow.
 *
 * Shaped to exercise the mapping rather than to look plausible: incident
 * SEN-1002 links two hosts to one alert (the row-cloning path), carries a
 * private IP (unticked by default) beside a routable one, and repeats a
 * hostname SEN-1001 already used so the within-import dedup counter has
 * something to count.
 *
 * `listIncidents` honours the filters client-side. `armSource` translates them
 * to OData and lets ARM do it; the answers have to agree, which is the only
 * reason this filters at all rather than returning everything.
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
} from './source'

export const FIXTURE_IDENTITY = 'analyst@example.invalid'

const WORKSPACES: readonly ImportSource[] = [
  {
    key: '/fixture/workspaces/aurora-soc',
    name: 'aurora-soc',
    group: 'Aurora Holdings \u00b7 Fixture tenant',
    handle: { subscription_id: 'fixture-sub-1', resource_group: 'rg-soc', workspace_name: 'aurora-soc' },
  },
  {
    key: '/fixture/workspaces/aurora-lab',
    name: 'aurora-lab',
    group: 'Aurora Holdings \u00b7 Fixture tenant',
    handle: { subscription_id: 'fixture-sub-1', resource_group: 'rg-lab', workspace_name: 'aurora-lab' },
  },
  {
    key: '/fixture/workspaces/borealis-ops',
    name: 'borealis-ops',
    group: 'Borealis Freight \u00b7 Fixture tenant',
    handle: {
      subscription_id: 'fixture-sub-2',
      resource_group: 'rg-ops',
      workspace_name: 'borealis-ops',
    },
  },
]

function incident(fields: Partial<RemoteIncident> & { key: string; number: string }): RemoteIncident {
  return {
    title: '',
    severity: 'Medium',
    status: 'New',
    created: '',
    firstActivity: '',
    description: '',
    url: '',
    provider: 'Microsoft Sentinel',
    ...fields,
  }
}

const INCIDENTS: readonly RemoteIncident[] = [
  incident({
    key: 'SEN-1001',
    number: '1001',
    title: 'Suspicious sign-in from an unfamiliar location',
    severity: 'High',
    status: 'New',
    created: '2026-07-30 09:12 UTC',
    firstActivity: '2026-07-30T08:55:00Z',
    description: 'Impossible-travel sign-in followed by a mailbox rule change.',
    url: 'https://portal.example.invalid/incidents/1001',
  }),
  incident({
    key: 'SEN-1002',
    number: '1002',
    title: 'Credential dumping tool executed on two workstations',
    severity: 'High',
    status: 'Active',
    created: '2026-07-30 11:40 UTC',
    firstActivity: '2026-07-30T11:02:00Z',
    description: 'LSASS access from an unsigned binary on WKS-0142 and WKS-0143.',
    url: 'https://portal.example.invalid/incidents/1002',
  }),
  incident({
    key: 'SEN-1003',
    number: '1003',
    title: 'Outbound traffic to a newly registered domain',
    severity: 'Medium',
    status: 'Active',
    created: '2026-07-30 13:05 UTC',
    firstActivity: '2026-07-30T12:58:00Z',
    description: 'Repeated beaconing from a server subnet.',
    url: 'https://portal.example.invalid/incidents/1003',
  }),
  incident({
    key: 'SEN-1004',
    number: '1004',
    title: 'Consent granted to an unverified cloud application',
    severity: 'Low',
    status: 'Closed',
    created: '2026-07-29 16:22 UTC',
    firstActivity: '2026-07-29T16:20:00Z',
    description: 'A user consented to an application with mail.read.',
    url: 'https://portal.example.invalid/incidents/1004',
  }),
]

function alert(fields: Partial<RemoteAlert> & { key: string; title: string }): RemoteAlert {
  return {
    severity: 'Medium',
    timeGenerated: '',
    startTimeUtc: '',
    tactics: [],
    ...fields,
  }
}

function entity(kind: string, id: string, properties: Record<string, string>): RawEntity {
  return { kind, id, properties }
}

const DETAIL: Readonly<Record<string, Omit<IncidentDetail, 'raw'>>> = {
  'SEN-1001': {
    alerts: [
      alert({
        key: 'SEN-1001/alerts/a1',
        title: 'Impossible travel sign-in',
        severity: 'High',
        timeGenerated: '2026-07-30T08:55:00Z',
        tactics: ['InitialAccess'],
      }),
      alert({
        key: 'SEN-1001/alerts/a2',
        title: 'Inbox rule created to forward mail externally',
        severity: 'Medium',
        timeGenerated: '2026-07-30T09:05:00Z',
        tactics: ['Collection'],
      }),
    ],
    entities: [
      entity('Account', 'e-account-1', {
        accountName: 'r.okonjo',
        upnSuffix: 'example.invalid',
        friendlyName: 'r.okonjo@example.invalid',
      }),
      entity('Ip', 'e-ip-1', { address: '203.0.113.24', friendlyName: '203.0.113.24' }),
      entity('Host', 'e-host-1', { hostName: 'WKS-0142', friendlyName: 'WKS-0142' }),
      // Dropped before the analyst sees it: no table holds a URL entity.
      entity('Url', 'e-url-1', { url: 'https://mail.example.invalid/rules' }),
    ],
    alertEntityIds: {
      'SEN-1001/alerts/a1': ['e-account-1', 'e-ip-1', 'e-host-1', 'e-url-1'],
      'SEN-1001/alerts/a2': ['e-account-1', 'e-url-1'],
    },
  },
  'SEN-1002': {
    alerts: [
      alert({
        key: 'SEN-1002/alerts/a1',
        title: 'Credential dumping tool executed',
        severity: 'High',
        timeGenerated: '2026-07-30T11:02:00Z',
        tactics: ['CredentialAccess'],
      }),
    ],
    entities: [
      // WKS-0142 again: SEN-1001 already planned it, so importing both
      // incidents together counts one duplicate rather than creating two.
      entity('Host', 'e-host-2', { hostName: 'WKS-0142', friendlyName: 'WKS-0142' }),
      entity('Host', 'e-host-3', { hostName: 'WKS-0143', friendlyName: 'WKS-0143' }),
      entity('FileHash', 'e-hash-1', {
        hashValue: '9f2b7c1de4a05836bb41d0f7c2a9e83154cd6207b9ae4f1c8d3025be7761aa94',
        friendlyName: 'unsigned.exe',
      }),
      // Private, so it starts unticked - the noise rule.
      entity('Ip', 'e-ip-2', { address: '10.4.11.9', friendlyName: '10.4.11.9' }),
    ],
    alertEntityIds: {
      'SEN-1002/alerts/a1': ['e-host-2', 'e-host-3', 'e-hash-1', 'e-ip-2'],
    },
  },
  'SEN-1003': {
    alerts: [
      alert({
        key: 'SEN-1003/alerts/a1',
        title: 'Beaconing to a newly registered domain',
        severity: 'Medium',
        timeGenerated: '2026-07-30T12:58:00Z',
        tactics: ['CommandAndControl'],
      }),
    ],
    entities: [
      entity('Ip', 'e-ip-3', { address: '198.51.100.77', friendlyName: '198.51.100.77' }),
      entity('Host', 'e-host-4', { hostName: 'SRV-0031', friendlyName: 'SRV-0031' }),
    ],
    alertEntityIds: { 'SEN-1003/alerts/a1': ['e-ip-3', 'e-host-4'] },
  },
  'SEN-1004': {
    alerts: [
      alert({
        key: 'SEN-1004/alerts/a1',
        title: 'Consent granted to an unverified application',
        severity: 'Low',
        timeGenerated: '2026-07-29T16:20:00Z',
        // Not an ATT&CK tactic this app knows, so the row lands with an empty
        // tactic rather than a guessed one.
        tactics: ['SuspiciousActivity'],
      }),
    ],
    entities: [
      entity('CloudApplication', 'e-app-1', {
        appName: 'Ledger Sync',
        friendlyName: 'Ledger Sync',
      }),
      entity('Account', 'e-account-2', {
        accountName: 'k.varga',
        upnSuffix: 'example.invalid',
        friendlyName: 'k.varga@example.invalid',
      }),
    ],
    alertEntityIds: { 'SEN-1004/alerts/a1': ['e-app-1', 'e-account-2'] },
  },
}

const EMPTY_DETAIL: Omit<IncidentDetail, 'raw'> = { alerts: [], entities: [], alertEntityIds: {} }

/**
 * The fixture's own rows, in the shape ARM answers with.
 *
 * **Derived from the normalised fixture rather than written twice.** The server
 * maps from the provider's payload, so a fixture that carried only the
 * normalised shapes would exercise a path no real import takes -- and two
 * hand-written copies of one incident drift. This is the one place the
 * direction is backwards, and it is backwards on purpose: the fixture is the
 * source of truth for what the incident *is*, and this states it the way
 * Sentinel would.
 */
function armShaped(one: Omit<IncidentDetail, 'raw'>): IncidentDetail['raw'] {
  return {
    alerts: one.alerts.map((item) => ({
      id: item.key,
      name: item.key,
      properties: {
        systemAlertId: item.key,
        alertDisplayName: item.title,
        severity: item.severity,
        tactics: [...item.tactics],
        timeGenerated: item.timeGenerated,
        startTimeUtc: item.startTimeUtc,
      },
    })),
    entities: one.entities.map((item) => ({
      kind: item.kind,
      id: item.id,
      name: item.id,
      properties: { ...item.properties },
    })),
  }
}

/** How many incidents one fixture page carries - small so the cursor path is
 *  exercised by four rows rather than by fifty. */
export const FIXTURE_PAGE_SIZE = 2

function matches(item: RemoteIncident, filters: IncidentFilter): boolean {
  if (filters.severity !== 'Any' && item.severity !== filters.severity) return false
  if (filters.status !== 'Any' && item.status !== filters.status) return false
  const title = filters.title.trim().toLowerCase()
  if (title && !item.title.toLowerCase().includes(title)) return false
  const number = filters.number.trim()
  // A non-numeric id is dropped, not applied - `filterWarning` says so on
  // screen. Applying it would return nothing and look like an empty workspace.
  if (number && /^\d+$/.test(number) && item.number !== number) return false
  return true
}

export interface FixtureSourceOptions {
  /** Incidents to serve instead of the built-in four. */
  incidents?: readonly RemoteIncident[]
  /** Detail by incident key, instead of the built-in map. */
  detail?: Readonly<Record<string, IncidentDetail>>
  /** Fails `connect` with this message, for the sign-in-refused state. */
  connectError?: string
}

/**
 * A source backed by the fixture data above.
 *
 * A factory rather than a constant: a story that wants one incident, or a
 * failing connect, gets its own instance instead of mutating a shared one.
 */
export function fixtureSource(options: FixtureSourceOptions = {}): IncidentSource {
  const incidents = options.incidents ?? INCIDENTS
  const detail = options.detail ?? DETAIL

  return {
    name: 'Microsoft Sentinel',
    sourceNoun: 'workspace',

    connect(): Promise<ImporterSession> {
      if (options.connectError !== undefined) return Promise.reject(new Error(options.connectError))
      return Promise.resolve({
        identity: FIXTURE_IDENTITY,
        expiresOn: Math.floor(Date.now() / 1000) + 3600,
      })
    },

    listSources(): Promise<SourceListing> {
      return Promise.resolve({
        sources: WORKSPACES,
        groups: [...new Set(WORKSPACES.map((source) => source.group))],
        unavailable: 0,
      })
    },

    listIncidents(_session, _source, filters, cursor): Promise<IncidentPage> {
      const shown = incidents.filter((item) => matches(item, filters))
      // The cursor is opaque to every caller; this one happens to encode an
      // offset, exactly as ARM's happens to encode a skip token.
      const start = cursor === null ? 0 : Number(cursor)
      const page = shown.slice(start, start + FIXTURE_PAGE_SIZE)
      const next = start + FIXTURE_PAGE_SIZE
      return Promise.resolve({
        incidents: page,
        cursor: next < shown.length ? String(next) : null,
      })
    },

    fetchDetail(_session, _source, item): Promise<IncidentDetail> {
      const found = detail[item.key] ?? EMPTY_DETAIL
      return Promise.resolve({ ...found, raw: armShaped(found) })
    },
  }
}
