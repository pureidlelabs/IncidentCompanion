/**
 * The generated sections, attacked at what they omit.
 *
 * **Two opposite failures, one per rule.** A missing customer that prints
 * nothing hides a gap the reader has to see; a blank *Eradicated* line asserts a
 * phase the response never reached. Getting either rule the wrong way round
 * produces a document that reads perfectly and says something untrue.
 */
import { describe, expect, it } from 'vitest'

import {
  actions,
  caseHeader,
  entities,
  evidence,
  indicators,
  timeline,
  type CaseData,
} from './sections.js'
import type { MinorHeadNode, Node, ProseNode, TableNode } from './model.js'
import type { ReportInput } from './resolve.js'
import { english } from './packs.js'

function input(caseData: Partial<CaseData>): ReportInput {
  return {
    title: 'CASE-1',
    tlp: '',
    t: english(),
    languageCoverage: 1,
    language: 'en',
    blocks: [],
    caseData: { id: 'c1', title: 'CASE-1', ...caseData },
  }
}

const table = (nodes: ReturnType<typeof caseHeader>) => nodes[0] as TableNode

/**
 * The strip's figures, as `[label, value]`.
 *
 * **Re-anchored from a key/value table to a strip**, which is what the block is
 * now: a figure is a muted label with its value beneath, so the pair is one
 * cell in each of two rows rather than two cells in one row. Every property
 * these tests hold survived the change - the *reading* of a label did not.
 */
const figuresOf = (nodes: ReturnType<typeof caseHeader>): [string, string][] => {
  const out: [string, string][] = []
  for (const one of nodes) {
    if (one.type !== 'table') continue
    const [labels, values] = one.rows
    labels?.forEach((cell, at) => {
      if (cell.text !== '') out.push([cell.text, values?.[at]?.text ?? ''])
    })
  }
  return out
}

/** The line under the strip, which is where the full record lives. */
const footOf = (nodes: ReturnType<typeof caseHeader>): string =>
  nodes
    .filter((one) => one.type === 'prose')
    .flatMap((one) => (one as { paras: string[] }).paras)
    .join(' ')

describe('the case header', () => {
  it('says a customer is not recorded rather than printing nothing', () => {
    // A report about nobody has to look like one. An omitted identity figure
    // reads as a report for a customer whose name simply was not printed.
    expect(figuresOf(caseHeader(input({})))).toContainEqual(['CUSTOMER', 'Not recorded'])
    expect(figuresOf(caseHeader(input({})))).toContainEqual(['ANALYST', 'Not recorded'])
  })

  it('drops a lifecycle stamp that has not happened', () => {
    // The opposite rule, and the reason it is opposite: an empty "Contained"
    // line states a phase the response never reached.
    const foot = footOf(caseHeader(input({ openedAt: '2026-08-01T09:00:00Z' })))
    expect(foot).toContain('Opened')
    expect(foot).not.toContain('Contained')
    expect(foot).not.toContain('Closed')
  })

  it('prints a stamp in UTC, spelled out', () => {
    // A report crosses the analyst's zone, the customer's and the authority's.
    // A bare local time in a filing is read correctly by one of the three.
    expect(footOf(caseHeader(input({ openedAt: '2026-08-01T09:05:00Z' })))).toContain(
      'Opened: 2026-08-01 09:05 UTC',
    )
  })

  it('omits a classification nobody made', () => {
    // Stated, never derived: an unclassified case shows no figure rather than a
    // defensible-looking guess.
    const labels = figuresOf(caseHeader(input({}))).map(([key]) => key)
    expect(labels).not.toContain('INCIDENT CLASS')
    expect(labels).not.toContain('SEVERITY')

    const classified = figuresOf(caseHeader(input({ incidentClass: 'hacking', severity: 'high' })))
    expect(classified).toContainEqual(['INCIDENT CLASS', 'hacking'])
    expect(classified).toContainEqual(['SEVERITY', 'high'])
  })

  it('draws no column titles over a strip', () => {
    expect(table(caseHeader(input({}))).header).toBeUndefined()
  })

  /**
   * **The header carries the response clock, and the standard layout has no
   * other block that does.** `metrics` was dropped from that layout on the
   * stated grounds that "the case header strip carries time-to-detect, dwell,
   * assets and containment" - which was true of Python's strip and never of
   * this one, so the shipped report had no response figure anywhere in it. The
   * layout's docstring was describing the other backend.
   */
  it('carries the response figures the standard layout drops the metrics block for', () => {
    const nodes = caseHeader(
      input({
        timeline: [{ time: '2026-08-01T08:00:00Z', description: 'in' }],
        detectedAt: '2026-08-01T09:00:00Z',
        containedAt: '2026-08-01T10:00:00Z',
        systems: [
          { id: 's1', verdict: 'compromised', isolated: true },
          { id: 's2', verdict: 'compromised' },
        ],
      }),
    )
    const text = JSON.stringify(nodes)
    expect(text).toContain('TIME TO DETECT')
    expect(text).toContain('1 h 0 min')
    expect(text).toContain('DWELL TIME')
    expect(text).toContain('2 h 0 min')
    expect(text).toContain('1 of 2')
  })

  /**
   * **The second site of the same defect.** The metric was written out twice,
   * exactly as containment coverage was, so fixing the metrics table alone
   * would leave the header strip on every standard-layout report still
   * reporting the catalogue as the blast radius.
   */
  it('counts the strip figure off the verdict rather than the catalogue', () => {
    const figures = figuresOf(
      caseHeader(
        input({
          systems: [
            { id: 's1', verdict: 'compromised' },
            { id: 's2', verdict: 'clean' },
            { id: 's3', verdict: 'unknown' },
            { id: 's4' },
          ],
        }),
      ),
    )
    expect(figures).toContainEqual(['HOSTS AFFECTED', '1'])
  })

  /**
   * **The strip's two asset figures are one claim, read twice.** A coverage
   * denominator that is not the hosts figure beside it is an arithmetic error
   * a customer can see. Sharing the predicate makes them equal by
   * construction; this holds them there.
   */
  it('reports a coverage denominator equal to the hosts figure beside it', () => {
    const figures = figuresOf(
      caseHeader(
        input({
          systems: [
            { id: 's1', verdict: 'compromised', isolated: true },
            { id: 's2', verdict: 'suspected' },
            { id: 's3', verdict: 'clean', isolated: true },
            { id: 's4', verdict: 'unknown' },
            { id: 's5' },
          ],
        }),
      ),
    )
    const affected = figures.find(([label]) => label === 'HOSTS AFFECTED')?.[1]
    const coverage = figures.find(([label]) => label === 'CONTAINMENT COVERAGE')?.[1]
    expect(affected).toBe('2')
    expect(coverage).toBe(`1 of ${String(affected)}`)
  })

  /**
   * **A strip is for the figures you triage on.** Detection provenance and six
   * lifecycle stamps each buying a figure cell is a dashboard nobody can read;
   * they carry to the line under it, which is where the full record lives.
   */
  it('keeps the timestamps off the strip and states them under it', () => {
    const nodes = caseHeader(input({ openedAt: '2026-08-01T09:00:00Z', detectionSource: 'EDR alert' }))
    const strips = nodes.filter((one) => one.type === 'table')
    expect(JSON.stringify(strips)).not.toContain('2026-08-01 09:00')

    const foot = nodes.filter((one) => one.type !== 'table')
    expect(JSON.stringify(foot)).toContain('2026-08-01 09:00')
    expect(JSON.stringify(foot)).toContain('EDR alert')
  })

  /**
   * **Three across, and a short row is padded to it.** Both halves are the same
   * defect in different clothes: five across chopped `DEMO-202 / 6-001` in
   * Python, and a short last row leaves a fixed-layout table with a cell of no
   * declared width.
   */
  it('lays the strip three across and squares off a short row', () => {
    const nodes = caseHeader(input({ customer: 'Acme', analyst: 'An Analyst' }))
    for (const one of nodes) {
      if (one.type !== 'table') continue
      expect(one.widths).toHaveLength(3)
      for (const row of one.rows) expect(row).toHaveLength(3)
    }
  })
})

describe('the timeline', () => {
  it('says so in words when the case has no entries', () => {
    // An empty table with headers and no rows reads as a rendering failure;
    // one line of text reads as a finding.
    const nodes = timeline(input({ timeline: [] }))
    expect((nodes[0] as ProseNode).paras[0]).toBe('No timeline entries recorded.')
  })

  it('puts the entries in time order', () => {
    const nodes = timeline(
      input({
        timeline: [
          { time: '2026-08-01T12:00:00Z', description: 'second' },
          { time: '2026-08-01T09:00:00Z', description: 'first' },
        ],
      }),
    )
    expect((nodes[0] as TableNode).rows.map((row) => row[3]!.text)).toEqual(['first', 'second'])
  })

  it('sorts an undated entry last, never first', () => {
    // At the top it reads as the first thing that happened - the one claim a
    // timeline must never make by accident.
    const nodes = timeline(
      input({
        timeline: [
          { description: 'no time recorded' },
          { time: '2026-08-01T09:00:00Z', description: 'first' },
        ],
      }),
    )
    expect((nodes[0] as TableNode).rows.map((row) => row[3]!.text)).toEqual([
      'first',
      'no time recorded',
    ])
  })

  /**
   * **A burst is one row that says how many.** The screen's timeline and the
   * narrative both group neighbouring identical beats through `consecutiveRuns`
   * and this table did not, so a 40-beacon burst was one card on screen and
   * forty rows in the customer's document. Python asserts the same property
   * across all three of its deliverables.
   */
  it('rolls a burst of identical beats into one row carrying the count', () => {
    const beat = (time: string) => ({ time, description: 'C2 beacon', technique: 'T1071.001' })
    const nodes = timeline(
      input({ timeline: [beat('2026-08-01T09:00:00Z'), beat('2026-08-01T09:01:00Z'), beat('2026-08-01T09:02:00Z')] }),
    )
    const rows = (nodes[0] as TableNode).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]![3]!.text).toContain('C2 beacon')
    expect(rows[0]![3]!.text).toContain('3')
  })

  /**
   * **Adjacency, not identity.** Anything else happening in between splits the
   * run, so a recurrence *after* the response is never folded back into the
   * burst before it - which would tell the reader the activity stopped when it
   * had not.
   */
  it('splits a run that something else interrupted', () => {
    const beat = (time: string, description: string) => ({ time, description })
    const nodes = timeline(
      input({
        timeline: [
          beat('2026-08-01T09:00:00Z', 'C2 beacon'),
          beat('2026-08-01T09:01:00Z', 'host isolated'),
          beat('2026-08-01T09:02:00Z', 'C2 beacon'),
        ],
      }),
    )
    expect((nodes[0] as TableNode).rows).toHaveLength(3)
  })

  /** A grouped row states the window it covers; a single entry states its stamp. */
  it('states the span a grouped row covers and collapses one that is not a span', () => {
    const beat = (time: string) => ({ time, description: 'C2 beacon' })
    const grouped = timeline(
      input({ timeline: [beat('2026-08-01T09:00:00Z'), beat('2026-08-01T11:00:00Z')] }),
    )
    expect((grouped[0] as TableNode).rows[0]![0]!.text).toContain('\u2013')

    const single = timeline(input({ timeline: [beat('2026-08-01T09:00:00Z')] }))
    expect((single[0] as TableNode).rows[0]![0]!.text).not.toContain('\u2013')
  })

  /**
   * **The actor column names the side, not the person.** Which of the two this
   * was is the reading the whole table is scanned for, and it is carried in
   * `kind`; the author is a name that is empty on every adversary row.
   */
  it('names the side rather than printing an empty author', () => {
    const nodes = timeline(
      input({
        timeline: [
          { time: '2026-08-01T09:00:00Z', description: 'beacon', kind: 'event' },
          { time: '2026-08-01T10:00:00Z', description: 'isolated', kind: 'action', author: 'An Analyst' },
        ],
      }),
    )
    const rows = (nodes[0] as TableNode).rows
    expect(rows[0]![1]!.text).toBe('Adversary')
    expect(rows[1]![1]!.text).toBe('Our response')
    // Coloured apart, or the column is a word the eye cannot use.
    expect(rows[0]![1]!.ink).not.toBe(rows[1]![1]!.ink)
  })

  /**
   * **How well the entry is known travels with it.** A timeline that prints a
   * suspected beat identically to a confirmed one is a document asserting more
   * than the case established.
   */
  it('carries the confidence and the tool that saw it', () => {
    const nodes = timeline(
      input({
        timeline: [
          { time: '2026-08-01T09:00:00Z', description: 'beacon', confidence: 'suspected', sourceTool: 'EDR' },
          { time: '2026-08-01T10:00:00Z', description: 'nothing known' },
        ],
      }),
    )
    const rows = (nodes[0] as TableNode).rows
    expect(rows[0]![4]!.text).toBe('suspected \u00b7 EDR')
    // Not blank: an empty cell reads as a column that failed to render.
    expect(rows[1]![4]!.text).toBe('\u2014')
  })

  /**
   * **Re-anchored onto the fields the row prints now.** It read `description`
   * and `author`; the actor column carries `kind` since the side is what the
   * column is scanned for, so `author` is no longer painted at all. The failure
   * it exists for is unchanged and still the easiest one to ship: a resolver
   * reading a field name the table does not have renders every cell blank, and
   * a fixture built in the shape the resolver expects cannot see it.
   */
  it('reads the columns this server has, not the ones Python had', () => {
    const nodes = timeline(
      input({
        timeline: [
          {
            description: 'the event',
            kind: 'action',
            technique: 'T1059',
            confidence: 'confirmed',
            sourceTool: 'EDR',
          },
        ],
      }),
    )
    const row = (nodes[0] as TableNode).rows[0]!
    expect(row[1]!.text).toBe('Our response')
    expect(row[2]!.text).toBe('T1059')
    expect(row[3]!.text).toBe('the event')
    expect(row[4]!.text).toBe('confirmed \u00b7 EDR')
  })
})

describe('the evidence register', () => {
  it('keeps the local file path out of a document that leaves the building', () => {
    // It names a location under the analyst's own cases directory: meaningless
    // to a recipient, and a line of filesystem layout in a customer document.
    const nodes = evidence(
      input({
        evidence: [
          {
            name: 'memory.raw',
            location: 'taken from the console',
            hash: 'abc123',
            hashAlgorithm: 'sha256',
            filePath: '/Users/analyst/cases/CASE-1/evidence/abc123',
          } as never,
        ],
      }),
    )
    const painted = JSON.stringify(nodes)
    expect(painted).not.toContain('/Users/analyst')
    expect(painted).toContain('taken from the console')
  })

  it('prints the digest with the function that produced it', () => {
    // A bare hash cannot be checked by whoever receives it.
    const nodes = evidence(
      input({ evidence: [{ name: 'memory.raw', hash: 'abc123', hashAlgorithm: 'sha256' }] }),
    )
    expect((nodes[0] as TableNode).rows[0]![3]!.text).toBe('sha256:abc123')
  })

  it('says so in words when nothing was collected', () => {
    expect((evidence(input({ evidence: [] }))[0] as ProseNode).paras[0]).toBe(
      'No evidence recorded.',
    )
  })
})

describe('the response actions', () => {
  const rows = [
    { task: 'Reset the credentials', status: 'completed' },
    { task: 'Re-image the host', status: 'in progress' },
    { task: 'Review the firewall', status: 'open' },
  ]

  it('answers applied and outstanding as two tables, not one sorted list', () => {
    // Article 23 asks a final report for "applied and ongoing mitigation
    // measures", which is two claims. One table makes the regulator work out
    // which rows are still open -- the half they are actually checking.
    const nodes = actions(input({ actions: rows }))
    const headings = nodes.filter((one): one is MinorHeadNode => one.type === 'minorHead')
    expect(headings.map((one) => one.text)).toEqual(['Applied measures', 'Outstanding measures'])

    const tables = nodes.filter((one): one is TableNode => one.type === 'table')
    expect(tables[0]!.rows).toHaveLength(1)
    expect(tables[1]!.rows).toHaveLength(2)
  })

  it('counts a cancelled action as applied rather than outstanding', () => {
    // It is settled: listing it as ongoing tells a regulator work is still
    // planned that was deliberately dropped.
    const nodes = actions(input({ actions: [{ task: 'Rebuild the DC', status: 'cancelled' }] }))
    const headings = nodes.filter((one): one is MinorHeadNode => one.type === 'minorHead')
    expect(headings.map((one) => one.text)).toEqual(['Applied measures'])
  })

  it('leaves out a group with nothing in it', () => {
    // "Applied" over an empty table reads as measures taken and not listed.
    const nodes: Node[] = actions(input({ actions: [{ task: 'Review', status: 'open' }] }))
    const headings = nodes.filter((one): one is MinorHeadNode => one.type === 'minorHead')
    expect(headings.map((one) => one.text)).toEqual(['Outstanding measures'])
  })
})

describe('the entity roll-up', () => {
  const headings = (nodes: Node[]) =>
    nodes.filter((one): one is MinorHeadNode => one.type === 'minorHead').map((one) => one.text)

  it('answers all five kinds, even the ones with nothing in them', () => {
    // A reader scanning for a hostname should not have to work out which of
    // five headings the app filed it under, and a kind that is silently absent
    // reads as a kind the app does not track.
    expect(headings(entities(input({})))).toEqual([
      'Assets',
      'Accounts',
      'Network indicators',
      'Malware',
      'Cloud applications',
    ])
  })

  it('says an empty kind has nothing rather than drawing an empty table', () => {
    const nodes = entities(input({}))
    expect(nodes.filter((one) => one.type === 'table')).toHaveLength(0)
    expect((nodes[1] as ProseNode).paras[0]).toBe('No assets recorded.')
  })

  it('carries malware and cloud apps, which reached the old report as neither', () => {
    // Malware arrived only as text somebody had appended to a timeline
    // description, and cloud apps not at all.
    const nodes = entities(
      input({
        malware: [{ id: 'm1', filename: 'invoice.exe', hash: 'ff00', family: 'Emotet' }],
        cloudApps: [{ appName: 'Sharefile', publisher: 'Nobody', verifiedPublisher: 'unverified' }],
      }),
    )
    const painted = JSON.stringify(nodes)
    expect(painted).toContain('invoice.exe')
    expect(painted).toContain('Sharefile')
  })

  /**
   * **Two tenants of one application are two rows, and the report has to say
   * which.** The name alone repeats, so the instance rides in the same cell
   * rather than taking a fourth column -- a Word table's widths are fixed and
   * the importer's own label already reads `Name (instance)`.
   */
  it('names the instance beside the application, when there is one', () => {
    const painted = JSON.stringify(entities(input({
      cloudApps: [
        { appName: 'Ledger', instance: 'acme-eu', verifiedPublisher: 'verified' },
        { appName: 'Ledger', instance: 'acme-us', verifiedPublisher: 'verified' },
        { appName: 'Sharefile', verifiedPublisher: 'unverified' },
      ],
    })))
    expect(painted).toContain('Ledger (acme-eu)')
    expect(painted).toContain('Ledger (acme-us)')
    // An app with no instance is not given empty brackets.
    expect(painted).toContain('"Sharefile"')
  })

  /**
   * **The report reads the columns the table has.** `sections.ts` declares its
   * own row shapes beside `domain/entities/*`, so a column rename is invisible
   * to the typechecker here -- every indicator cell rendered empty and every
   * assertion stayed green on fixtures describing a row that no longer exists.
   */
  it('prints the value of an indicator, whatever kind it is', () => {
    const painted = JSON.stringify(entities(input({
      networkIndicators: [
        { id: 'n1', type: 'ipv4', value: '198.51.100.7' },
        { id: 'n2', type: 'url', value: 'http://evil.example/a' },
      ],
    })))
    expect(painted).toContain('198.51.100.7')
    expect(painted).toContain('http://evil.example/a')
  })

  it('shows whichever address kind the indicator has, in one column', () => {
    // A row carries an IP or a domain and rarely both; two columns would be one
    // empty cell on every row.
    const nodes = entities(
      input({
        networkIndicators: [
          { id: 'n1', type: 'domain', value: 'paste-drop.example' },
          { id: 'n2', type: 'ipv4', value: '203.0.113.47' },
        ],
      }),
    )
    const table = nodes.find((one): one is TableNode => one.type === 'table')!
    expect(table.rows.map((row) => row[0]!.text)).toEqual(['paste-drop.example', '203.0.113.47'])
  })

  it('marks a hostname as an indicator so the defang pass can reach it', () => {
    const nodes = entities(input({ systems: [{ id: 's1', hostname: 'DC-01' }] }))
    const table = nodes.find((one): one is TableNode => one.type === 'table')!
    expect(table.rows[0]![0]!.indicator).toBe(true)
    expect(table.rows[0]![1]!.indicator).toBeUndefined()
  })
})

describe('the indicator list', () => {
  it('keeps the port beside the address', () => {
    // Blocking a host outright is not the same instruction as blocking a
    // service on it, and a recipient acts on this list directly.
    const nodes = indicators(
      input({
        networkIndicators: [
          { id: 'n1', type: 'ipv4', value: '203.0.113.47', port: '443', disposition: 'malicious' },
        ],
      }),
    )
    const row = (nodes[0] as TableNode).rows[0]!
    expect(row[0]!.text).toBe('203.0.113.47')
    expect(row[1]!.text).toBe('443')
  })

  it('says so in words when the case has none', () => {
    expect((indicators(input({}))[0] as ProseNode).paras[0]).toBe(
      'No network indicators recorded.',
    )
  })
})
