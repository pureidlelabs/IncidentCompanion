/**
 * **The two visual blocks that are tables rather than pictures.**
 */
import { describe, expect, it } from 'vitest'

import { defangDocument } from './defang.js'
import { execCard, killchain } from './visuals.js'
import { HIGH, INK, LOW, MEDIUM } from './palette.js'
import type { Cell, Node, TableNode } from './model.js'
import type { ReportInput } from './resolve.js'
import { english } from './packs.js'

/**
 * **Built, not cast.**
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
   * **An uncontained incident's dwell is marked as still running.**
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
   * it.**
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
   * **The line above the block is a caption, never a heading node.**
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
   * **The counts come from the collections, and an absent collection is zero
   * rather than a crash.**
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
   * **The label is the half that lied, and nothing held it.**
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
   * from that fill.**
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
   * **Every reference kind an entry can carry, not just the host.**
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

  /** An empty grid is a sentence, not a table with no rows. */
  it('says so when nothing was reached', () => {
    const nodes = killchain(input({ id: 'c', title: 'Case', timeline: [] }))
    expect(tables(nodes)).toHaveLength(0)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.type).toBe('prose')
  })

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
   * **The failure is one document disagreeing with itself.**
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
