import { describe, expect, it } from 'vitest'

import type {
  AccountEntry,
  Case,
  NetworkIndicator,
  SystemEntry,
  TimelineEntry,
  TimelineEvent,
} from '@/api/model'
import { isEvent } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { buildEntityGraph, neighbours } from './entity-graph'
import { refDeclarations, refTargets, timelineListFields } from './graph-references'

/**
 * Held against a fixture whose expected layout was computed by hand.
 *
 * The counts below were worked out against `campaign.json` by hand and are the
 * only thing that says this build draws the graph that fixture describes.
 * Nothing else in the suite can see a graph that is subtly wrong: a build that
 * dropped a link kind renders, and every assertion about the links it yields
 * stays true of the links it was given.
 */

const kinds = (links: readonly { kind: string }[]): Record<string, number> => {
  const counted: Record<string, number> = {}
  for (const link of links) counted[link.kind] = (counted[link.kind] ?? 0) + 1
  return counted
}

describe('the reference declarations, read off the specs document', () => {
  it('declares each reference field once, however many forms carry it', () => {
    // **The property, not a count.** `system_id` appears in both EVENT_FIELDS
    // and TIMELINE_ACTION_FIELDS, so following it twice would double every
    // edge a timeline entry carries - and a total pinned to a number is a
    // test that goes red every time a form gains or loses a reference, which
    // says nothing about whether the dedup still works.
    const declared = refDeclarations(specsFixture)
    const pairs = declared.map((entry) => `${entry.collection}.${entry.field}`)

    expect(new Set(pairs).size).toBe(declared.length)
    // And it is reading a real document rather than an empty one.
    expect(declared.length).toBeGreaterThan(10)
  })

  it('names all six reference targets, each pointing at a case key', () => {
    expect([...refTargets(refDeclarations(specsFixture)).keys()]).toEqual([
      'account',
      'cloud_app',
      'evidence',
      'malware',
      'network',
      'system',
    ])
    expect(refTargets(refDeclarations(specsFixture)).get('cloud_app')).toBe('cloudApps')
  })

  it('orders the timeline list fields the dataclass does, not the form', () => {
    // The hub of an entry naming no host is `referenced[0]`, so this order
    // decides what a star is drawn from. The specs document carries form
    // order, which puts `evidence_ids` last.
    expect(timelineListFields(refDeclarations(specsFixture))).toEqual([
      'evidenceIds',
      'cloudAppIds',
      'accountIds',
      'networkIndicatorIds',
      'malwareIds',
    ])
  })

  it('refuses a list reference it has no order for, rather than dropping its edges', () => {
    expect(() =>
      timelineListFields([
        {
          collection: 'timeline',
          field: 'containerIds',
          target: 'container',
          targetCollection: 'systems',
          multiple: true,
        },
      ]),
    ).toThrow(/containerIds/)
  })
})

describe('the entity graph, on the 86-entry campaign fixture', () => {
  const graph = buildEntityGraph(campaignCase, specsFixture)

  /**
   * **Counted off the case rather than quoted.** A quoted total has to be
   * re-typed whenever the graph legitimately grows, and swapping one number
   * for another gives no way to tell a new kind from a lost one.
   *
   * `impact` is the kind that makes this worth doing: it references a host, an
   * account and its evidence and nothing references it, so a kind dropped from
   * the graph leaves every quoted count still reading as correct.
   */
  it('draws one node per entity of every kind it draws', () => {
    const byKind: Record<string, number> = {}
    for (const node of graph.nodes.values()) byKind[node.kind] = (byKind[node.kind] ?? 0) + 1

    expect(byKind).toEqual({
      system: campaignCase.systems.length,
      account: campaignCase.accounts.length,
      network: campaignCase.networkIndicators.length,
      malware: campaignCase.malware.length,
      evidence: campaignCase.evidence.length,
      cloud_app: campaignCase.cloudApps.length,
      impact: campaignCase.impact.length,
    })
    expect(graph.nodes.size).toBe(
      Object.values(byKind).reduce((total, count) => total + count, 0),
    )
    // An id appearing twice would collapse two entities into one node, which a
    // per-kind tally cannot see.
    expect(graph.nodes.size).toBeGreaterThan(50)
  })

  /**
   * **The mix, not the total.** Which of the three kinds an edge is carries
   * the meaning - a structural edge stays true whatever the timeline says -
   * and the proportions are stable across changes that move the totals. An
   * absolute count goes stale the moment a collection joins the graph.
   */
  it('draws one edge per pair, across all three kinds', () => {
    const mix = kinds(graph.links)
    expect(Object.keys(mix).sort()).toEqual(['event', 'movement', 'structural'])
    for (const [kind, count] of Object.entries(mix)) {
      expect(count, `no ${kind} edges at all`).toBeGreaterThan(5)
    }
    expect(graph.links).toHaveLength(
      Object.values(mix).reduce((total, count) => total + count, 0),
    )

    // One edge per unordered pair, which is the property the dedup exists for.
    const pairs = graph.links.map(({ src, dst }) => (src < dst ? `${src}|${dst}` : `${dst}|${src}`))
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('never draws an edge to a node that is not there', () => {
    for (const link of graph.links) {
      expect(graph.nodes.has(link.src)).toBe(true)
      expect(graph.nodes.has(link.dst)).toBe(true)
    }
  })

  it('does not make timeline entries into nodes', () => {
    const entryIds = new Set(campaignCase.timeline.map((entry) => entry.id))
    for (const id of graph.nodes.keys()) expect(entryIds.has(id)).toBe(false)
  })
})

/** One real row per table, to build variants from. Indexed access is
 * `| undefined` under `noUncheckedIndexedAccess`, and a spread of undefined
 * quietly makes every field optional. */
function first<T>(rows: readonly T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('the campaign fixture lost a table')
  return row
}

/** The timeline is a union, and a graph variant is always built from an event. */
function firstEvent(rows: readonly TimelineEntry[]): TimelineEvent {
  const row = rows.find(isEvent)
  if (row === undefined) throw new Error('the campaign fixture lost its events')
  return row
}

describe('what an edge means', () => {
  const base: Case = {
    ...campaignCase,
    timeline: [],
    systems: [],
    accounts: [],
    networkIndicators: [],
    malware: [],
    cloudApps: [],
    evidence: [],
    impact: [],
  }

  const system = (id: string, hostname: string): SystemEntry => ({
    ...first(campaignCase.systems),
    id,
    hostname,
    verdict: 'clean',
    isolated: false,
  })
  const entry = (over: Partial<TimelineEvent>): TimelineEvent => ({
    ...firstEvent(campaignCase.timeline),
    id: `t-${String(Math.random())}`,
    kind: 'event',
    systemId: null,
    sourceSystemId: null,
    accountIds: [],
    evidenceIds: [],
    cloudAppIds: [],
    networkIndicatorIds: [],
    malwareIds: [],
    hideFromGraph: false,
    ...over,
  })

  it('keeps the structural claim when a pair is also linked by an entry', () => {
    // Structural runs first and one pair draws one edge, so the more durable
    // claim wins: "this file was found on this host" stays true whatever the
    // timeline says.
    const kase: Case = {
      ...base,
      systems: [system('sys-1', 'HOST-A')],
      malware: [
        { ...first(campaignCase.malware), id: 'mal-1', systemId: 'sys-1', accountId: null },
      ],
      timeline: [entry({ systemId: 'sys-1', malwareIds: ['mal-1'] })],
    }
    const { links } = buildEntityGraph(kase, specsFixture)
    expect(links).toHaveLength(1)
    expect(links[0]?.kind).toBe('structural')
  })

  it('honours hideFromGraph, which is the analyst calling an entry noise', () => {
    const kase: Case = {
      ...base,
      systems: [system('sys-1', 'A'), system('sys-2', 'B')],
      timeline: [entry({ systemId: 'sys-2', sourceSystemId: 'sys-1', hideFromGraph: true })],
    }
    expect(buildEntityGraph(kase, specsFixture).links).toHaveLength(0)
  })

  it('dissolves an entry into a star from its host, never a clique', () => {
    // Three accounts on one entry: a clique is three edges and asserts links
    // between entities that merely co-occurred. A star is three.
    const kase: Case = {
      ...base,
      systems: [system('sys-1', 'A')],
      accounts: ['a1', 'a2', 'a3'].map(
        (id): AccountEntry => ({ ...first(campaignCase.accounts), id, accountName: id, disabled: false }),
      ),
      timeline: [entry({ systemId: 'sys-1', accountIds: ['a1', 'a2', 'a3'] })],
    }
    const { links } = buildEntityGraph(kase, specsFixture)
    expect(links).toHaveLength(3)
    expect(links.every((link) => link.src === 'sys-1')).toBe(true)
  })

  it('makes the first reference the hub when an entry names no host at all', () => {
    // "Malicious indicators blocked at perimeter firewall" is about the edge
    // of the network, not a machine. Dropping those entries loses every link
    // they carry.
    const kase: Case = {
      ...base,
      networkIndicators: ['n1', 'n2'].map(
        (id): NetworkIndicator => ({
          ...first(campaignCase.networkIndicators),
          id,
          type: 'domain', value: id,
          systemId: null,
          malwareId: null,
          blocked: false,
        }),
      ),
      timeline: [entry({ networkIndicatorIds: ['n1', 'n2'] })],
    }
    const { links } = buildEntityGraph(kase, specsFixture)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ src: 'n1', dst: 'n2', kind: 'event' })
  })

  it('records a source and destination host as a movement', () => {
    const kase: Case = {
      ...base,
      systems: [system('sys-1', 'A'), system('sys-2', 'B')],
      timeline: [entry({ systemId: 'sys-2', sourceSystemId: 'sys-1' })],
    }
    const { links } = buildEntityGraph(kase, specsFixture)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ src: 'sys-1', dst: 'sys-2', kind: 'movement' })
  })

  it('drops a dangling reference rather than drawing a line into empty canvas', () => {
    const kase: Case = {
      ...base,
      systems: [system('sys-1', 'A')],
      timeline: [entry({ systemId: 'sys-1', malwareIds: ['gone'] })],
    }
    expect(buildEntityGraph(kase, specsFixture).links).toHaveLength(0)
  })

  it('leaves an account uncoloured, because it carries no assessment', () => {
    const kase: Case = {
      ...base,
      accounts: [
        { ...first(campaignCase.accounts), id: 'a1', accountName: 'svc-backup', disabled: true },
      ],
    }
    const node = buildEntityGraph(kase, specsFixture).nodes.get('a1')
    expect(node?.danger).toBe('')
    expect(node?.dangerField).toBe('')
    // Containment is a separate signal, and a tooltip rather than a colour.
    expect(node?.contained).toBe('disabled')
  })

  it('names the field a verdict came from, so the tone is the server\u2019s answer', () => {
    const kase: Case = {
      ...base,
      systems: [{ ...system('sys-1', 'A'), verdict: 'compromised' }],
      networkIndicators: [
        {
          ...first(campaignCase.networkIndicators),
          id: 'n1',
          type: 'domain', value: 'evil.example',
          disposition: 'malicious',
          systemId: null,
          malwareId: null,
          blocked: true,
        },
      ],
    }
    const { nodes } = buildEntityGraph(kase, specsFixture)
    expect(nodes.get('sys-1')?.dangerField).toBe('verdict')
    expect(nodes.get('n1')?.dangerField).toBe('disposition')
    expect(nodes.get('n1')?.contained).toBe('blocked')
  })
})

describe('adjacency', () => {
  it('is undirected: a movement\u2019s direction is a property of the edge', () => {
    const adjacency = neighbours([{ src: 'a', dst: 'b', kind: 'movement', label: '' }])
    expect([...(adjacency.get('a') ?? [])]).toEqual(['b'])
    expect([...(adjacency.get('b') ?? [])]).toEqual(['a'])
  })
})
