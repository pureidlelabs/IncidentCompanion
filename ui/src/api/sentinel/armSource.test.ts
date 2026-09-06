import { describe, expect, it, vi } from 'vitest'

import { ARM, armSource, assertArmUrl, odataFilter, retryAfterSeconds } from './armSource'
import { DEFAULT_FILTER, type ImporterSession, type ImportSource } from './source'

const TOKEN = 'fake-arm-token'
const tokens = { acquireToken: () => Promise.resolve(TOKEN) }
const SESSION: ImporterSession = { identity: 'analyst@example.invalid', expiresOn: 0 }
const WORKSPACE: ImportSource = {
  key: '/subscriptions/s1/resourcegroups/rg1/providers/\u2026/workspaces/ws1',
  name: 'ws1',
  group: 'Sub One',
  handle: { subscriptionId: 's1', resourceGroup: 'rg1', workspaceName: 'ws1' },
}

/** A fetch that answers each call from a queue and records what it was asked. */
function serve(...answers: { status?: number; body?: unknown; headers?: Record<string, string> }[]) {
  const calls: { url: string; method: string; auth: string | undefined }[] = []
  let at = 0
  const fetchImpl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({
      // Never `String(url)`: a `Request` stringifies to `[object Object]`, so
      // every URL assertion below would compare the same useless value.
      url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      method: init?.method ?? 'GET',
      auth: headers.get('authorization') ?? undefined,
    })
    const answer = answers[Math.min(at, answers.length - 1)]
    at += 1
    return Promise.resolve(new Response(
      answer?.body === undefined ? '' : JSON.stringify(answer.body),
      { status: answer?.status ?? 200, ...(answer?.headers ? { headers: answer.headers } : {}) },
    ))
  })
  return { calls, options: { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: () => Promise.resolve() } }
}

describe('the ARM bearer goes to ARM and nowhere else', () => {
  it('refuses a link off the ARM origin', () => {
    expect(() => { assertArmUrl('https://evil.test/incidents') }).toThrow(/refusing to follow/)
  })

  it('refuses a host that merely starts with the ARM one', () => {
    expect(() => { assertArmUrl('https://management.azure.com.evil.test/x') })
      .toThrow(/refusing to follow/)
  })

  it('refuses a nextLink that is not a URL at all', () => {
    expect(() => { assertArmUrl('not a url') }).toThrow(/not a URL/)
  })

  it('accepts ARM itself', () => {
    expect(() => { assertArmUrl('https://management.azure.com/tenants?api-version=1') })
      .not.toThrow()
  })

  it('never sends the token to a hostile nextLink', async () => {
    const { calls, options } = serve(
      { body: { value: [], nextLink: 'https://evil.test/page2' } },
    )
    const source = armSource(tokens, options)

    const page = await source.listIncidents(SESSION, WORKSPACE, DEFAULT_FILTER, null)
    await expect(source.listIncidents(SESSION, WORKSPACE, DEFAULT_FILTER, page.cursor))
      .rejects.toThrow(/refusing to follow/)

    expect(calls.every((call) => new URL(call.url).origin === ARM)).toBe(true)
  })
})

describe('a rate limit is honoured but not trusted', () => {
  it('clamps a large Retry-After', () => {
    expect(retryAfterSeconds('99999')).toBe(60)
  })

  it('refuses a negative one rather than waiting backwards', () => {
    expect(retryAfterSeconds('-5')).toBe(0)
  })

  it('falls back on the HTTP-date form rather than throwing', () => {
    // RFC 9110 allows it and this does not parse it. Throwing here would reach
    // a caller catching import failures and read as the import failing.
    expect(retryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(5)
    expect(retryAfterSeconds(null)).toBe(5)
  })

  it('retries a 429 and then succeeds', async () => {
    const { calls, options } = serve(
      { status: 429, headers: { 'retry-after': '1' } },
      { body: { value: [] } },
    )
    await armSource(tokens, options).listSources(SESSION)
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('the OData filter', () => {
  it('is null when nothing is filtered', () => {
    expect(odataFilter(DEFAULT_FILTER)).toBeNull()
  })

  it('doubles a quote rather than letting it close the literal', () => {
    expect(odataFilter({ ...DEFAULT_FILTER, title: "O'Brien" }))
      .toBe("contains(properties/title,'O''Brien')")
  })

  it('drops a non-numeric incident id instead of sending it', () => {
    // Sentinel rejects the whole query on one, so the choice is drop-and-warn
    // or lose every result. `filterWarning` is the warning half.
    expect(odataFilter({ ...DEFAULT_FILTER, number: 'abc', status: 'New' }))
      .toBe("properties/status eq 'New'")
  })

  it('filters the window on createdTimeUtc, not first activity', () => {
    // The window means "raised during my shift". First activity can predate
    // that by days on a slow detection, which hides the incident the analyst
    // came in to triage.
    const now = new Date('2026-08-03T12:00:00Z')
    expect(odataFilter({ ...DEFAULT_FILTER, sinceHours: 24 }, now))
      .toBe('properties/createdTimeUtc ge 2026-08-02T12:00:00Z')
  })

  it('joins several clauses with and', () => {
    expect(odataFilter({ ...DEFAULT_FILTER, severity: 'High', number: '42' }))
      .toBe("properties/severity eq 'High' and properties/incidentNumber eq 42")
  })
})

describe('listing workspaces', () => {
  it('counts a subscription it cannot read rather than failing the listing', async () => {
    const { options } = serve(
      { body: { value: [{ subscriptionId: 's1', displayName: 'Open' },
                        { subscriptionId: 's2', displayName: 'Closed' }] } },
      { body: { value: [{ id: '/subscriptions/s1/resourceGroups/rg1/x/ws1', name: 'ws1' }] } },
      { status: 403, body: { error: 'no' } },
    )

    const listing = await armSource(tokens, options).listSources(SESSION)

    expect(listing.sources.map((s) => s.name)).toEqual(['ws1'])
    expect(listing.unavailable).toBe(1)
  })

  it('reads the resource group out of the workspace id', async () => {
    // The handle needs it and the workspaces listing does not carry it as a
    // field; the id is the only place it appears.
    const { options } = serve(
      { body: { value: [{ subscriptionId: 's1', displayName: 'Sub' }] } },
      { body: { value: [{ id: '/subscriptions/s1/resourceGroups/RG-SOC/providers/x/workspaces/w', name: 'w' }] } },
    )

    const listing = await armSource(tokens, options).listSources(SESSION)

    expect(listing.sources[0]?.handle).toEqual({
      subscriptionId: 's1', resourceGroup: 'RG-SOC', workspaceName: 'w',
    })
  })
})

describe('reading incidents', () => {
  it('maps the fields the table and the seed both need', async () => {
    const { options } = serve({ body: { value: [{
      name: 'inc-1',
      properties: {
        incidentNumber: 7, title: 'Beaconing', severity: 'High', status: 'New',
        createdTimeUtc: '2026-08-03T09:14:33Z',
        firstActivityTimeUtc: '2026-08-01T22:00:00Z',
        description: 'seen on the edge', incidentUrl: 'https://portal.azure.com/x',
        providerName: 'Azure Sentinel',
      },
    }] } })

    const page = await armSource(tokens, options)
      .listIncidents(SESSION, WORKSPACE, DEFAULT_FILTER, null)

    expect(page.incidents[0]).toEqual({
      key: 'inc-1', number: '7', title: 'Beaconing', severity: 'High', status: 'New',
      created: '2026-08-03 09:14 UTC',
      firstActivity: '2026-08-01T22:00:00Z',
      description: 'seen on the edge', url: 'https://portal.azure.com/x',
      provider: 'Azure Sentinel',
    })
    expect(page.cursor).toBeNull()
  })

  it('passes the cursor through untouched instead of rebuilding the query', async () => {
    // The nextLink already carries $skipToken, the filter and the page size.
    // Rebuilding beside it is how a resumed page applies different filters
    // from the first.
    const next = 'https://management.azure.com/x?$skipToken=abc&$top=50'
    const { calls, options } = serve(
      { body: { value: [], nextLink: next } },
      { body: { value: [] } },
    )
    const source = armSource(tokens, options)

    const first = await source.listIncidents(
      SESSION, WORKSPACE, { ...DEFAULT_FILTER, severity: 'High' }, null)
    await source.listIncidents(
      SESSION, WORKSPACE, { ...DEFAULT_FILTER, severity: 'High' }, first.cursor)

    expect(first.cursor).toBe(next)
    expect(calls[1]?.url).toBe(next)
  })
})

describe('reading one incident', () => {
  it('links every entity to every alert, and says so', async () => {
    const { calls, options } = serve(
      { body: { value: [
        { id: 'a1', properties: { alertDisplayName: 'One', severity: 'High', tactics: ['Execution'] } },
        { id: 'a2', properties: { displayName: 'Two', severity: 'Low' } },
      ] } },
      { body: { entities: [
        { kind: 'Host', id: 'e1', properties: { hostName: 'WKS-1' } },
        { kind: 'Ip', id: 'e2', properties: { address: '198.51.100.4' } },
      ] } },
    )

    const detail = await armSource(tokens, options).fetchDetail(
      SESSION, WORKSPACE, { key: 'inc-1' } as never)

    expect(detail.alerts.map((a) => a.title)).toEqual(['One', 'Two'])
    expect(detail.alerts[0]?.tactics).toEqual(['Execution'])
    expect(detail.entities.map((e) => e.kind)).toEqual(['Host', 'Ip'])
    expect(detail.alertEntityIds).toEqual({ a1: ['e1', 'e2'], a2: ['e1', 'e2'] })
    expect(calls.every((call) => call.method === 'POST')).toBe(true)
  })

  it('keeps every entity kind, leaving the filtering to the mapper', async () => {
    // Two places deciding which kinds are supported means the one that runs
    // first silently wins. `mapping.ts` owns it.
    const { options } = serve(
      { body: { value: [] } },
      { body: { entities: [{ kind: 'Mailbox', id: 'e9', properties: { upn: 'x@y.invalid' } }] } },
    )

    const detail = await armSource(tokens, options).fetchDetail(
      SESSION, WORKSPACE, { key: 'inc-1' } as never)

    expect(detail.entities.map((e) => e.kind)).toEqual(['Mailbox'])
  })
})
