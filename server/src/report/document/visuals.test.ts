/**
 * **The two visual blocks that are tables rather than pictures.**
 *
 * Word draws neither SVG nor `foreignObject` and no graph leaves the app at
 * all, so a figure here has to be a shaded table or nothing.
 *
 * These tests are written against the *neutral model*, not against painted
 * output: a resolver's job is to say what the block means, and each painter
 * escapes for its own target. What they attack is the class of claim a visual
 * block makes without meaning to -- a baked-in title, a confident zero, a
 * settled-looking figure for a live incident.
 */
import { describe, expect, it } from 'vitest'

import { defangDocument } from './defang.js'
import { execCard, killchain } from './visuals.js'
import { HIGH, INK, LOW, MEDIUM } from './palette.js'
import type { Cell, Node, TableNode } from './model.js'
import type { ReportInput } from './resolve.js'
import { english } from './packs.js'

/**
 * **Built, not cast.** `as unknown as ReportInput` over the whole fixture lets
 * it skip a required field with the compiler saying nothing, and the failure
 * arrives at run time instead. Only `caseData` takes the cast, and only because
 * these build a case by hand.
 */
const input = (caseData: Record<string, unknown>): ReportInput => ({
  title: 'R',
  tlp: '',
  language: 'en',
  t: english(),
  languageCoverage: 1,
  blocks: [],
  caseData: caseData as unknown as ReportInput['caseData'],
})

const tables = (nodes: Node[]): TableNode[] =>
  nodes.filter((node): node is TableNode => node.type === 'table')

const texts = (nodes: Node[]): string =>
  JSON.stringify(nodes)

describe('the executive card', () => {
  /**
   * **A missing figure is "not recorded", never a zero and never blank.**
   * Every lifecycle field is optional, so the honest answer to an unfilled one
   * is a visible blank - a confident `0` on a customer report is a claim
   * nobody made.
   */
  it('says a figure is not recorded rather than printing nothing', () => {
    const nodes = execCard(input({ id: 'c', title: 'Case' }))
    const [card] = tables(nodes)
    expect(card).toBeDefined()
    const values = card!.rows[0]!.map((cell) => cell.text)
    expect(values).toHaveLength(3)
    for (const value of values) expect(value).not.toBe('')
    expect(texts(nodes).toLowerCase()).toContain('not recorded')
  })

  /**
   * **An uncontained incident's dwell is marked as still running.** This is
   * the trap the metrics section already carries: a dwell printed as a plain
   * figure reads as the incident being over, and the exec card is the block a
   * customer reads first.
   *
   * **Both fixtures carry a timeline entry, and that is load-bearing.** Dwell
   * is measured from the first thing that happened rather than from
   * `detectedAt`, so a case with no timeline has no dwell at all -- and the
   * settled-dwell assertion below passes against "Not recorded", green and
   * covering nothing.
   */
  it('marks dwell as ongoing while nothing has contained the incident', () => {
    const detected = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const nodes = execCard(
      input({
        id: 'c',
        title: 'Case',
        timeline: [{ time: new Date(Date.now() - 4 * 60 * 60 * 1000), description: 'in' }],
        detectedAt: detected,
      }),
    )
    expect(texts(nodes).toLowerCase()).toContain('ongoing')
  })

  it('prints a settled dwell without the marking once contained', () => {
    const detected = new Date('2026-01-01T00:00:00Z')
    const contained = new Date('2026-01-01T03:00:00Z')
    const nodes = execCard(
      input({
        id: 'c',
        title: 'Case',
        timeline: [{ time: new Date('2025-12-31T23:00:00Z'), description: 'in' }],
        detectedAt: detected,
        containedAt: contained,
      }),
    )
    expect(texts(nodes).toLowerCase()).toContain('4 h 0 min')
    expect(texts(nodes).toLowerCase()).not.toContain('ongoing')
  })

  /**
   * **The subtitle is its own node, above the table, and never a row inside
   * it.** A resolver that emits the heading as well puts every visual under its
   * heading twice, and renaming the section strands the baked copy. The block
   * owns its heading; the resolver does not print one.
   */
  it('puts who this is about beside the card rather than inside it', () => {
    const nodes = execCard(input({ id: 'c', title: 'Case', customer: 'Northwind', status: 'open' }))
    const [card] = tables(nodes)
    expect(card!.rows.every((row) => row.every((cell) => !cell.text.includes('Northwind')))).toBe(
      true,
    )
    expect(texts(nodes)).toContain('Northwind')
  })

  /**
   * **The line above the block is a caption, never a heading node.** A
   * `subtitle` paints as an H1, so `## Summary` is followed by
   * `# Acme Corp . DEMO-2026-001` and the document reads as restarting
   * mid-section.
   */
  it('captions the block rather than heading it', () => {
    const nodes = execCard(input({ id: 'c', title: 'Case', customer: 'Northwind' }))
    expect(nodes.some((node) => node.type === 'subtitle' || node.type === 'subhead')).toBe(false)
    const [first] = nodes
    expect(first!.type).toBe('richPara')
  })

  /** Three figures in one row is what makes it read as a card rather than a list. */
  it('lays the three figures out as one row of three', () => {
    const [card] = tables(execCard(input({ id: 'c', title: 'Case' })))
    expect(card!.rows[0]).toHaveLength(3)
    expect(card!.widths).toHaveLength(3)
  })

  /**
   * **The counts come from the collections, and an absent collection is
   * zero rather than a crash.** A report is rendered from a frozen tree that
   * may predate a table existing at all.
   */
  it('counts assets and accounts without them being present', () => {
    expect(() => execCard(input({ id: 'c', title: 'Case' }))).not.toThrow()
    const nodes = execCard(
      input({ id: 'c', title: 'Case', systems: [{ id: 's' }], accounts: [{ id: 'a' }, { id: 'b' }] }),
    )
    expect(texts(nodes)).toContain('1')
    expect(texts(nodes)).toContain('2')
  })

  /**
   * **The label is the half nothing else holds.** The assertion above is a
   * substring check against the serialised block, so `'1'` matches any
   * timestamp in it: the count can be right and the word wrong -- the catalogue
   * printed as "N assets affected" -- and no case moves unless the whole line is
   * named.
   */
  it('calls both halves of the line what they count: the catalogue', () => {
    const nodes = execCard(
      input({ id: 'c', title: 'Case', systems: [{ id: 's' }], accounts: [{ id: 'a' }, { id: 'b' }] }),
    )
    expect(texts(nodes)).toContain('1 assets in scope \u00b7 2 accounts involved')
  })
})

describe('the kill chain grid', () => {
  const entry = (tactic: string, over: Partial<Record<string, unknown>> = {}) => ({
    tactic,
    time: '2026-01-01T00:00:00Z',
    description: 'x',
    ...over,
  })

  /**
   * **Only the stages something reached.** The ribbon above it answers "how
   * far did they get", so its empty cells are the answer; this answers "what
   * did they touch", where nine empty rows are padding.
   */
  it('draws only the stages the intrusion reached', () => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [{ id: 's1', hostname: 'web01' }],
          timeline: [entry('execution', { systemId: 's1' })],
        }),
      ),
    )
    expect(grid!.rows).toHaveLength(1)
    expect(grid!.rows[0]![0]!.text.toLowerCase()).toBe('execution')
  })

  /**
   * **The stage cell carries its severity as a fill, and its ink is computed
   * from that fill.** White on the ramp fails at every rung, so a resolver
   * that set a fill and left the ink alone would ship unreadable text.
   */
  it('fills a stage with its severity and inks it for contrast', () => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [{ id: 's1', hostname: 'web01' }],
          timeline: [entry('lateral movement', { systemId: 's1' })],
        }),
      ),
    )
    const stage = grid!.rows[0]![0]!
    expect(stage.fill).toBe(HIGH)
    expect(stage.ink).toBe(INK)
  })

  it.each([
    ['reconnaissance', LOW],
    ['execution', MEDIUM],
    ['impact', HIGH],
  ])('gives %s its own rung', (tactic, fill) => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [{ id: 's1', hostname: 'web01' }],
          timeline: [entry(tactic, { systemId: 's1' })],
        }),
      ),
    )
    expect(grid!.rows[0]![0]!.fill).toBe(fill)
  })

  /**
   * **Every reference kind an entry can carry, not just the host.** The Node
   * timeline row declares `systemId` and carries four more columns the
   * interface never named - reading only the host is how this block silently
   * reports a lateral movement as touching one machine and nobody's account.
   *
   * **The column names here are the schema's.** A name invented for the fixture
   * *and* for the resolver leaves the two agreeing and every assertion passing
   * against a case shape that does not exist: a fixture you wrote cannot
   * disprove the names you assumed, and the typecheck is what catches it.
   */
  it('lists accounts, indicators and malware, not only the host', () => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [
            { id: 's1', hostname: 'web01' },
            { id: 's2', hostname: 'db01' },
          ],
          accounts: [{ id: 'a1', accountName: 'svc_backup' }],
          networkIndicators: [{ id: 'n1', type: 'ipv4', value: '10.0.0.9' }],
          malware: [{ id: 'm1', filename: 'beacon.dll' }],
          timeline: [
            entry('lateral movement', {
              systemId: 's1',
              sourceSystemId: 's2',
              accountIds: ['a1'],
              networkIndicatorIds: ['n1'],
              malwareIds: ['m1'],
            }),
          ],
        }),
      ),
    )
    const touched = grid!.rows[0]![1]!.text
    for (const name of ['web01', 'db01', 'svc_backup', '10.0.0.9', 'beacon.dll']) {
      expect(touched, `${name} is missing from what the stage touched`).toContain(name)
    }
  })

  /** The same host at one stage twice is one mention, in the order first seen. */
  it('names a thing once per stage', () => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [{ id: 's1', hostname: 'web01' }],
          timeline: [
            entry('execution', { systemId: 's1' }),
            entry('execution', { systemId: 's1' }),
          ],
        }),
      ),
    )
    expect(grid!.rows[0]![1]!.text.match(/web01/g)).toHaveLength(1)
  })

  /**
   * **A stage the ramp does not name produces no row**, whether it is blank or
   * merely unknown - an unclassified entry is work outstanding, not a phase.
   *
   * **What enforces this is the phase-order loop, not a guard.** Deleting an
   * explicit `if (!stage) continue` leaves every case here green, because
   * nothing reaches a row except by being named on the ramp. The unknown case is
   * in the table for that reason -- it is the one a guard on emptiness misses.
   */
  it.each([['blank', ''], ['unknown to this build', 'astral projection']])(
    'draws no row for a tactic that is %s',
    (_name, tactic) => {
      const nodes = killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [{ id: 's1', hostname: 'web01' }],
          timeline: [entry(tactic, { systemId: 's1' })],
        }),
      )
      expect(tables(nodes)).toHaveLength(0)
    },
  )

  it('says so when nothing was reached', () => {
    const nodes = killchain(input({ id: 'c', title: 'Case', timeline: [] }))
    expect(tables(nodes)).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.type).toBe('prose')
  })

  /**
   * **Stages print in intrusion order however the entries arrive.** The order
   * is the whole reading of the block - a reader takes "stopped before impact"
   * from where the rows stop, and timeline order is not phase order.
   */
  it('orders the stages as an intrusion proceeds, not as the entries arrived', () => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          systems: [{ id: 's1', hostname: 'web01' }],
          timeline: [
            entry('impact', { systemId: 's1', time: '2026-01-03T00:00:00Z' }),
            entry('initial access', { systemId: 's1', time: '2026-01-01T00:00:00Z' }),
          ],
        }),
      ),
    )
    const stages = grid!.rows.map((row: Cell[]) => row[0]!.text.toLowerCase())
    expect(stages).toEqual(['initial access', 'impact'])
  })

  /**
   * **The failure is one document disagreeing with itself.** `defangText`
   * reaches IPv4 and scheme-carrying URLs only, so a bare domain in a joined
   * list left the building clickable while the indicator table two pages
   * earlier printed the same value bracketed. Word autolinks the live one.
   *
   * Asserted *through* `defangDocument`, because the cell is correct until the
   * pass runs over it -- which is why nothing on `killchain`'s own output can
   * see this.
   */
  it('hands the defang pass a cell it may blank, so a bare domain cannot ship live', () => {
    const [grid] = tables(
      killchain(
        input({
          id: 'c',
          title: 'Case',
          networkIndicators: [{ id: 'n1', type: 'domain', value: 'evil-c2.example' }],
          timeline: [entry('command and control', { networkIndicatorIds: ['n1'] })],
        }),
      ),
    )

    const printed = defangDocument({
      title: 'R',
      tlp: '',
      language: 'en',
      languageCoverage: 1,
      sections: [{ blockId: 'b', kind: 'killchain', heading: '', nodes: [grid!] }],
    })

    const touched = (printed.sections[0]!.nodes[0] as TableNode).rows[0]![1]!.text
    expect(touched).toBe('evil-c2[.]example')
  })
})
