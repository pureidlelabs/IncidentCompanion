/**
 * The derived sections, attacked where they could assert something false.
 *
 * **A listing section fails by dropping a row; these fail by inventing one.** A
 * dwell time printed plainly on a live incident, a containment coverage of
 * "0 of 12" on a case nobody has worked, a first-seen timestamp that a blank
 * stamp sorted to the front - each is a confident-looking number the case never
 * established, and each renders perfectly.
 */
import { describe, expect, it } from 'vitest'

import { glossary, impact, metrics, ribbon, rootCause, techniqueTable, techniques } from './derived.js'
import type { Cell, Node, TableNode } from './model.js'
import type { CaseData } from './sections.js'
import type { ReportInput } from './resolve.js'
import { english } from './packs.js'
import { PHASE_SEVERITY } from './palette.js'

function input(data: Partial<CaseData>): ReportInput {
  return {
    title: 'Under test',
    tlp: '',
    language: 'en',
    t: english(),
    languageCoverage: 1,
    blocks: [],
    caseData: { id: 'c-1', title: 'Under test', ...data },
  }
}

/** The one table a section produced, or a failure naming what it produced. */
function table(nodes: Node[]): TableNode {
  const found = nodes.find((one): one is TableNode => one.type === 'table')
  if (!found) throw new Error(`no table: ${nodes.map((one) => one.type).join(', ')}`)
  return found
}

/** The value cell of the row whose label cell matches. */
function valueOf(node: TableNode, label: string): string | undefined {
  const row = node.rows.find((cells: Cell[]) => cells[0]?.text === label)
  return row?.[1]?.text
}

const flat = (nodes: Node[]): string => JSON.stringify(nodes)

/**
 * A case whose four clocks all read differently, so an assertion cannot pass
 * against the wrong anchor by coincidence.
 *
 * The demo case has `openedAt` equal to its first timeline entry, which is why
 * both response clocks agreed with Python's on it while being measured from
 * somewhere else entirely.
 */
const CLOCKS = {
  timeline: [{ time: '2026-01-01T08:00:00Z', description: 'first beacon' }],
  openedAt: '2026-01-01T10:00:00Z',
  detectedAt: '2026-01-01T10:30:00Z',
  containedAt: '2026-01-01T12:00:00Z',
}

describe('metrics', () => {
  /**
   * **Both response clocks start at the incident, not at the paperwork.**
   * Time to detect is how long the adversary was in before anyone noticed and
   * dwell is how long they were in altogether, so both are measured from the
   * earliest timeline entry - `openedAt` is when a case was *opened*, which on
   * a case raised days later flatters both figures without looking wrong.
   */
  it('measures time to detect from the first thing that happened', () => {
    const nodes = metrics(input(CLOCKS))
    // 08:00 -> 10:30. Anchored at openedAt it would read '30 min'.
    expect(valueOf(table(nodes), 'Time to detect')).toBe('2 h 30 min')
  })

  it('measures dwell from the first thing that happened', () => {
    const nodes = metrics(input(CLOCKS))
    // 08:00 -> 12:00. Anchored at detectedAt it would read '1 h 30 min'.
    expect(valueOf(table(nodes), 'Dwell time')).toBe('4 h 0 min')
  })

  it('runs dwell to the close when a closed case was never marked contained', () => {
    const nodes = metrics(
      input({ ...CLOCKS, containedAt: null, status: 'closed', closedAt: '2026-01-01T14:00:00Z' }),
    )
    expect(valueOf(table(nodes), 'Dwell time')).toBe('6 h 0 min')
  })

  /**
   * **A close on a case that is not closed is not a terminal stamp.** The
   * status is what makes it one; a stamp left behind by a reopen would
   * otherwise stop a clock that is still running.
   */
  it('keeps dwell running when a close stamp outlives its status', () => {
    const nodes = metrics(
      input({ ...CLOCKS, containedAt: null, status: 'open', closedAt: '2026-01-01T14:00:00Z' }),
    )
    expect(valueOf(table(nodes), 'Dwell time')).toContain('ongoing')
  })

  it('marks a dwell time that is still running', () => {
    // The defect this is named for: an unbounded dwell printed as a plain
    // figure reads as the incident being over. Python folds "ongoing" in
    // through a separate key, and an earlier reading dropped it.
    const nodes = metrics(input({ ...CLOCKS, containedAt: null }))
    expect(valueOf(table(nodes), 'Dwell time')).toContain('ongoing')
  })

  it('does not mark a dwell time that has been closed off', () => {
    const nodes = metrics(
      input({
        timeline: [{ time: '2026-01-01T00:00:00Z', description: 'first beacon' }],
        detectedAt: '2026-01-01T00:00:00Z',
        containedAt: '2026-01-01T02:00:00Z',
      }),
    )
    const dwell = valueOf(table(nodes), 'Dwell time')
    expect(dwell).not.toContain('ongoing')
    expect(dwell).toBe('2 h 0 min')
  })

  it('offers no containment coverage until something is contained', () => {
    // "0 of 12" on every unworked case is noise a reader takes for a
    // measurement of the response.
    const nodes = metrics(
      input({ systems: [{ id: 's1', verdict: 'compromised' }, { id: 's2' }] }),
    )
    expect(valueOf(table(nodes), 'Containment coverage')).toBeUndefined()
  })

  /**
   * **The attack: containment is a flag, and `contained` is not a verdict.**
   * Both coverage filters read `verdict === 'contained'`, which `ASSET_VERDICT`
   * cannot produce - so the figure was structurally absent from every report,
   * and the tests that covered it passed by supplying a verdict the product
   * has no way to store. A fixture here uses only values the vocabulary
   * permits.
   */
  it('reads containment off the isolated flag rather than the verdict', () => {
    const nodes = metrics(
      input({
        systems: [
          { id: 's1', verdict: 'compromised', isolated: true },
          { id: 's2', verdict: 'compromised' },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Containment coverage')).toBe('1 of 2')
  })

  it('offers no coverage for a verdict the vocabulary cannot produce', () => {
    // The exact fixture the old tests passed on. `contained` is not a member
    // of ASSET_VERDICT, so it must buy no figure.
    const nodes = metrics(
      input({ systems: [{ id: 's1', verdict: 'contained' }, { id: 's2' }, { id: 's3' }] }),
    )
    expect(valueOf(table(nodes), 'Containment coverage')).toBeUndefined()
  })

  /**
   * **The denominator is the assets that needed containing.** Counting every
   * catalogued asset states "1 of 30" for an estate of 27 clean bystanders,
   * which understates the response in a document handed to a customer.
   */
  it('counts coverage against the assets that needed containing', () => {
    const nodes = metrics(
      input({
        systems: [
          { id: 's1', verdict: 'compromised', isolated: true },
          { id: 's2', verdict: 'accessed' },
          { id: 's3', verdict: 'clean' },
          { id: 's4', verdict: 'unknown' },
          { id: 's5' },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Containment coverage')).toBe('1 of 2')
  })

  /**
   * **A ratio that cannot exceed one.** An isolated host nobody found anything
   * on is not coverage of the hosts that needed it; counting it in the
   * numerator alone would print "2 of 1".
   */
  it('never counts an isolated bystander into the numerator', () => {
    const nodes = metrics(
      input({
        systems: [
          { id: 's1', verdict: 'compromised', isolated: true },
          { id: 's2', verdict: 'clean', isolated: true },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Containment coverage')).toBe('1 of 1')
  })

  /**
   * **The decisive case: more catalogued assets than adjudicated ones.** This
   * is the only shape that tells the two definitions apart, and the metric
   * had no test of any kind before this one. Counting the catalogue tells a
   * customer that all five of the hosts their analyst scoped were touched.
   */
  it('counts the assets a verdict says were reached, not the ones catalogued', () => {
    const nodes = metrics(
      input({
        systems: [
          { id: 's1', verdict: 'compromised' },
          { id: 's2', verdict: 'accessed' },
          { id: 's3', verdict: 'clean' },
          { id: 's4', verdict: 'unknown' },
          { id: 's5' },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Hosts affected')).toBe('2')
  })

  /**
   * **A host the timeline names is not thereby affected**, which is where this
   * deliberately parts from the Python corpus. `_hosts_affected_ids` unions
   * every entry's `systemId` and `sourceSystemId`, so a blocked attempt
   * against a host the analyst then adjudicated `clean` counts as a hit. In a
   * customer document that is the same over-claim as counting the catalogue,
   * one definition over.
   */
  it('does not count a host the timeline names but the analyst cleared', () => {
    const nodes = metrics(
      input({
        timeline: [
          {
            time: '2026-01-01T08:00:00Z',
            description: 'blocked lateral movement',
            systemId: 's2',
            sourceSystemId: 's1',
          },
        ],
        systems: [
          { id: 's1', verdict: 'compromised' },
          { id: 's2', verdict: 'clean' },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Hosts affected')).toBe('1')
  })

  /**
   * **An unadjudicated estate has no finding to report, and "0" is a finding.**
   * The row is omitted for the reason the coverage row is: a figure on a case
   * nobody has worked is read as a measurement rather than as its absence.
   */
  it('omits the row entirely rather than asserting nothing was reached', () => {
    // The clocks are here so the table exists at all: a section with no rows
    // degrades to "Not recorded" prose, which would pass this assertion
    // without the hosts gate ever being consulted.
    const nodes = metrics(
      input({
        ...CLOCKS,
        systems: [{ id: 's1' }, { id: 's2', verdict: 'unknown' }, { id: 's3', verdict: 'clean' }],
      }),
    )
    const built = table(nodes)
    expect(valueOf(built, 'Time to detect')).toBeDefined()
    expect(valueOf(built, 'Hosts affected')).toBeUndefined()
  })

  /**
   * **The two figures print one row apart and must mean one thing by
   * "affected".** A hosts count of 5 above a coverage of "1 of 2" reads as an
   * arithmetic error in a document a customer is being handed; they share a
   * predicate so that they cannot drift apart.
   */
  it('agrees with the containment denominator about what was affected', () => {
    const nodes = table(
      metrics(
        input({
          systems: [
            { id: 's1', verdict: 'compromised', isolated: true },
            { id: 's2', verdict: 'commodity infection' },
            { id: 's3', verdict: 'suspected' },
            { id: 's4', verdict: 'clean', isolated: true },
            { id: 's5' },
          ],
        }),
      ),
    )
    expect(valueOf(nodes, 'Hosts affected')).toBe('3')
    expect(valueOf(nodes, 'Containment coverage')).toBe('1 of 3')
  })

  /**
   * **A verdict is compared lower-cased and trimmed**, because the column is
   * free text at the report tier - `SystemRow.verdict` is a bare `string`, so
   * nothing upstream of here guarantees the vocabulary's own spelling.
   */
  it('reads a verdict whatever case and padding it arrives in', () => {
    const nodes = metrics(
      input({
        systems: [
          { id: 's1', verdict: '  Compromised  ' },
          { id: 's2', verdict: 'CLEAN' },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Hosts affected')).toBe('1')
  })

  /**
   * **The two clocks in this table must agree about whether the case is
   * closed.** `responseClocks` refuses a `closedAt` on a case whose status is
   * not `closed`, on the stated grounds that a stamp left behind by a reopen
   * would stop a clock that is still running - and nothing clears the column,
   * which is client-written and stamped by no server code. Case age read the
   * same stamp with no such gate, so a reopened case published a dwell that
   * was still running above an age that had stopped.
   */
  it('does not freeze the case age on a stamp left behind by a reopen', () => {
    const stale = { openedAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-02T00:00:00Z' }
    const age = valueOf(table(metrics(input({ ...stale, status: 'open' }))), 'Case age')
    expect(age).not.toBe('24 h 0 min')
    expect(age).toBe(valueOf(table(metrics(input({ openedAt: stale.openedAt }))), 'Case age'))
  })

  it('still measures a closed case to the stamp it closed on', () => {
    const nodes = metrics(
      input({
        status: 'closed',
        openedAt: '2026-01-01T00:00:00Z',
        closedAt: '2026-01-02T00:00:00Z',
      }),
    )
    expect(valueOf(table(nodes), 'Case age')).toBe('24 h 0 min')
  })

  it('never reports a sub-minute span as zero', () => {
    // A detection that took forty seconds took forty seconds. "0 min" states
    // the opposite of what happened.
    //
    // **Re-anchored, not relaxed.** This measured `openedAt` -> `detectedAt`,
    // which is no longer where either response clock starts; the property it
    // exists for is the formatting floor, so it keeps its assertion and moves
    // its fixture onto the timeline.
    const nodes = metrics(
      input({
        timeline: [{ time: '2026-01-01T00:00:00Z', description: 'first beacon' }],
        detectedAt: '2026-01-01T00:00:40Z',
      }),
    )
    expect(valueOf(table(nodes), 'Time to detect')).toBe('< 1 min')
  })

  it('says nothing about a clock the case never started', () => {
    const nodes = metrics(input({}))
    expect(flat(nodes)).not.toContain('Time to detect')
  })
})

describe('impact', () => {
  it('states the severity even when nobody set one', () => {
    // An omitted severity row reads as unasked. An unstated severity is itself
    // the finding, so it is the one row that never disappears.
    expect(valueOf(table(impact(input({}))), 'Severity')).toBe('Not recorded')
  })

  it('says what was taken, and says so when nothing was', () => {
    // Article 23 and Article 33 both turn on this, so a missing row reads as
    // the question never having been put.
    expect(valueOf(table(impact(input({}))), 'Data affected')).toBe('None recorded')
    expect(
      valueOf(table(impact(input({ impact: [{ label: 'payroll.xlsx' }] }))), 'Data affected'),
    ).toBe('payroll.xlsx')
  })

  /**
   * **`untouched` is a finding that nothing happened, and this row says
   * affected.** `DATA_DISPOSITION` carries it for exactly that - "assessed,
   * and nothing happened to it" - so listing the dataset under *Data affected*
   * tells a customer their payroll share was hit when their analyst wrote down
   * that it was not. The old fixture supplied no disposition at all, which is
   * the same premise the code held.
   */
  it('leaves out a dataset the analyst assessed as untouched', () => {
    const nodes = impact(
      input({
        impact: [
          { label: 'payroll.xlsx', disposition: 'exfiltrated' },
          { label: 'HR archive share', disposition: 'untouched' },
        ],
      }),
    )
    expect(valueOf(table(nodes), 'Data affected')).toBe('payroll.xlsx')
  })

  it('answers no rather than listing data it was told nothing happened to', () => {
    const nodes = impact(input({ impact: [{ label: 'HR archive share', disposition: 'untouched' }] }))
    expect(valueOf(table(nodes), 'Data affected')).toBe('None recorded')
  })

  it('hides a compromised count of zero rather than asserting it', () => {
    const nodes = impact(input({ systems: [{ id: 's1' }] }))
    expect(valueOf(table(nodes), 'Assets compromised')).toBeUndefined()
  })
})

describe('root cause', () => {
  it('names the entry vector even when it is unknown', () => {
    // How they got in is the question the section exists for; an empty answer
    // is a finding and a missing row is an omission.
    expect(valueOf(table(rootCause(input({}))), 'Initial access')).toBe('Not recorded')
  })
})

describe('the glossary', () => {
  it('carries only the tactics the timeline actually used', () => {
    const nodes = glossary(
      input({ timeline: [{ tactic: 'exfiltration' }, { tactic: 'exfiltration' }] }),
    )
    expect(table(nodes).rows).toHaveLength(1)
    expect(table(nodes).rows[0]![1]!.text).toBe('TA0010')
  })

  it('says nothing rather than printing an empty table', () => {
    expect(glossary(input({})).map((one) => one.type)).toEqual(['prose'])
  })
})

describe('techniques', () => {
  it('orders the tactics by phase and not alphabetically', () => {
    // The sequence is the reading: how far the intrusion got. Alphabetically,
    // `exfiltration` precedes `initial access`, which reverses the story.
    const nodes = techniques(
      input({
        timeline: [
          { tactic: 'exfiltration', technique: 'T1041' },
          { tactic: 'initial access', technique: 'T1566' },
        ],
      }),
    )
    // **Re-anchored onto the ids, because the tactic names are no longer
    // printed here** - the band is the technique ids, flat, and the phase
    // story lives in the ribbon above it. The property is unchanged: the
    // order is the intrusion's, so `T1566` (initial access) precedes `T1041`
    // (exfiltration) exactly as it did when the tactics were the text.
    expect(flat(nodes).indexOf('T1566')).toBeLessThan(flat(nodes).indexOf('T1041'))
  })

  it('ignores an entry that names a technique with no tactic', () => {
    expect(techniques(input({ timeline: [{ technique: 'T1566' }] }))[0]!.type).toBe('prose')
  })
})

describe('the technique table', () => {
  it('rolls repeats into one row carrying the count', () => {
    const nodes = techniqueTable(
      input({
        timeline: [
          { technique: 'T1566', tactic: 'initial access', time: '2026-01-02T00:00:00Z' },
          { technique: 'T1566', tactic: 'initial access', time: '2026-01-01T00:00:00Z' },
          { technique: 'T1566', tactic: 'initial access', time: '2026-01-03T00:00:00Z' },
        ],
      }),
    )
    expect(table(nodes).rows).toHaveLength(1)
    const row = table(nodes).rows[0]!
    expect(row[2]!.text).toBe('3')
    expect(row[3]!.text).toContain('2026-01-01')
    expect(row[4]!.text).toContain('2026-01-03')
  })

  it('does not let an undated entry become the first sighting', () => {
    // An empty string sorts before every timestamp, so a blank stamp taken as
    // a time makes first-seen empty - a technique that looks unobserved.
    const nodes = techniqueTable(
      input({
        timeline: [
          { technique: 'T1059', tactic: 'execution', time: '2026-01-05T00:00:00Z' },
          { technique: 'T1059', tactic: 'execution' },
        ],
      }),
    )
    expect(table(nodes).rows[0]![3]!.text).toContain('2026-01-05')
  })

  /**
   * **The zone is on the column title, so it is not on every value.** That is
   * `formatTimestamp`'s own rule and this table was breaking it: four
   * characters a cell, which wrapped `UTC` onto a second line under every
   * stamp in a column headed *First seen (UTC)*. Nothing was asserting the
   * format here, so the change that fixed it went green either way - which is
   * what this exists to stop happening in reverse.
   */
  it('leaves the zone to the column title it is already in', () => {
    const nodes = techniqueTable(
      input({
        timeline: [
          { tactic: 'execution', technique: 'T1059', time: '2026-01-01T09:00:00Z' },
        ],
      }),
    )
    const headers = table(nodes).header ?? []
    expect(headers.some((one) => one.includes('UTC'))).toBe(true)
    expect(flat(nodes)).toContain('2026-01-01 09:00')
    expect(flat(nodes)).not.toContain('09:00 UTC')
  })

  it('puts the busiest technique first', () => {
    const nodes = techniqueTable(
      input({
        timeline: [
          { technique: 'T1001', tactic: 'execution' },
          { technique: 'T1002', tactic: 'execution' },
          { technique: 'T1002', tactic: 'execution' },
        ],
      }),
    )
    expect(table(nodes).rows[0]![0]!.text).toBe('T1002')
  })
})

describe('the ribbon as a path of coloured phases', () => {
  const entry = (tactic: string) => ({ tactic, time: '2026-01-01T00:00:00Z', description: 'x' })

  /**
   * **The phases carry their own ground, and the block is now a drawing.** This
   * asserted cells with a `fill` *and* an `ink`, which was right while the
   * ribbon was a band of shaded cells with the phase name printed on the
   * colour. It is a spine of diamonds now, so there is no text on a fill and
   * the contrast pairing has nothing to pair - the labels sit below in muted
   * ink on paper. The property that survives is the one worth keeping: the
   * phases reached, in intrusion order, each coloured from the ramp the kill
   * chain grid uses, so one document never colours a phase two ways.
   */
  it('carries each phase it reached, in order, coloured from the shared ramp', () => {
    const nodes = ribbon(input({ timeline: [entry('impact'), entry('initial access')] }))
    const spine = nodes.find((one) => one.type === 'spine')

    expect(spine).toBeDefined()
    // Intrusion order, not the order the entries arrived: the whole reading of
    // the block is where the path stops.
    expect(spine?.phases.map((phase) => phase.label)).toEqual(['initial access', 'impact'])
    for (const phase of spine?.phases ?? []) {
      expect(phase.fill).toBe(PHASE_SEVERITY[phase.label])
    }
  })

  it('still says how far of how many, in words', () => {
    const nodes = ribbon(input({ timeline: [entry('initial access')] }))
    expect(flat(nodes)).toContain('1')
    expect(flat(nodes)).toContain('14')
  })
})

describe('the techniques band', () => {
  it('draws each technique as its own chip rather than a comma list', () => {
    const nodes = techniques(
      input({
        timeline: [
          { tactic: 'execution', technique: 'T1059.005', time: '2026-01-01T00:00:00Z', description: 'x' },
          { tactic: 'initial access', technique: 'T1566.001', time: '2026-01-01T00:01:00Z', description: 'y' },
        ],
      }),
    )
    const cells = nodes
      .filter((one): one is TableNode => one.type === 'table')
      .flatMap((one) => one.rows.flat())
      .filter((cell) => cell.text !== '')

    expect(cells.map((cell) => cell.text).sort()).toEqual(['T1059.005', 'T1566.001'])
    // Mono, because an identifier read as prose is an identifier nobody checks.
    for (const cell of cells) expect(cell.mono).toBe(true)
  })

  it('says nothing rather than drawing an empty band', () => {
    expect(flat(techniques(input({})))).toContain('None recorded')
  })
})

describe('the ribbon', () => {
  it('lists the phases reached in kill-chain order', () => {
    const nodes = ribbon(
      input({ timeline: [{ tactic: 'impact' }, { tactic: 'initial access' }] }),
    )
    // **Re-anchored from a joined string onto the cells.** The phases are
    // coloured cells now rather than a sentence with arrows in it; what is
    // asserted is unchanged and is the only thing that ever mattered here -
    // the order is the intrusion's and not the order entries arrived.
    expect(flat(nodes).indexOf('initial access')).toBeLessThan(flat(nodes).indexOf('impact'))
  })

  it('counts the phases reached against every phase there is', () => {
    const nodes = ribbon(input({ timeline: [{ tactic: 'impact' }] }))
    expect(flat(nodes)).toContain('1 of 14')
  })

  it('says the timeline is empty rather than drawing an empty path', () => {
    expect(flat(ribbon(input({})))).not.toContain('\u203a')
  })
})
