/**
 * **The timeline down the page, as the appendix block.**
 */
import { describe, expect, it } from 'vitest'

import { narrative } from './narrative.js'
import { RESPONSE } from './palette.js'
import type { Node, TableNode } from './model.js'
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

const table = (nodes: Node[]): TableNode | undefined =>
  nodes.find((node): node is TableNode => node.type === 'table')

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString()

const beat = (over: Record<string, unknown> = {}) => ({
  time: at(0),
  description: 'Beacon to 203.0.113.47',
  kind: 'event',
  tactic: 'command and control',
  ...over,
})

describe('the incident narrative', () => {
  it('folds a burst of identical beats into one row', () => {
    const beats = Array.from({ length: 96 }, (_, index) => beat({ time: at(index) }))
    const grid = table(narrative(input({ id: 'c', title: 'Case', timeline: beats })))
    expect(grid!.rows).toHaveLength(1)
  })

  /** A run says how many it covers - the count is the only thing that says how many. */
  it('states how many a run covers', () => {
    const beats = Array.from({ length: 3 }, (_, index) => beat({ time: at(index) }))
    const grid = table(narrative(input({ id: 'c', title: 'Case', timeline: beats })))
    expect(JSON.stringify(grid!.rows)).toContain('\u00d73')
  })

  /**
   * **A recurrence after the response is its own beat.**
   */
  it('does not fold a recurrence back into an earlier burst', () => {
    const grid = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [
            beat({ time: at(0) }),
            beat({ time: at(1) }),
            beat({ time: at(2), description: 'Host isolated', kind: 'action' }),
            beat({ time: at(3) }),
          ],
        }),
      ),
    )
    expect(grid!.rows).toHaveLength(3)
  })

  /**
   * **Two beats reading the same but done by different sides are two beats.**
   */
  it('does not fold our action into an adversary beat that reads the same', () => {
    const grid = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [
            beat({ time: at(0), description: 'Session to FS-01', kind: 'event' }),
            beat({ time: at(1), description: 'Session to FS-01', kind: 'action' }),
          ],
        }),
      ),
    )
    expect(grid!.rows).toHaveLength(2)
    const fills = grid!.rows.map((row) => row.find((cell) => cell.fill)?.fill)
    expect(fills[0]).not.toBe(fills[1])
    expect(fills[1]).toBe(RESPONSE)
  })

  /**
   * **Our own action is marked in the response colour**, which is off the
   * severity ramp entirely: a containment step is not a severity, and painting
   * it on the ramp files the response under the attack's colour language.
   */
  it('marks our own action off the severity ramp', () => {
    const grid = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [beat({ description: 'Host isolated', kind: 'action' })],
        }),
      ),
    )
    expect(grid!.rows[0]!.some((cell) => cell.fill === RESPONSE)).toBe(true)
  })

  it('marks adversary activity with its phase severity, not the response colour', () => {
    const grid = table(narrative(input({ id: 'c', title: 'Case', timeline: [beat()] })))
    expect(grid!.rows[0]!.some((cell) => cell.fill === RESPONSE)).toBe(false)
    expect(grid!.rows[0]!.some((cell) => Boolean(cell.fill))).toBe(true)
  })

  /**
   * **A quiet day is a finding.**
   */
  it('gives a gap over an hour a band row of its own', () => {
    const withGap = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [beat({ time: at(0) }), beat({ time: at(300), description: 'Second beat' })],
        }),
      ),
    )
    const withoutGap = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [beat({ time: at(0) }), beat({ time: at(5), description: 'Second beat' })],
        }),
      ),
    )
    expect(withGap!.rows).toHaveLength(3)
    expect(withoutGap!.rows).toHaveLength(2)
  })

  /**
   * **Sorted by time, whatever order the rows arrive in.**
   */
  it('reads in time order rather than insertion order', () => {
    const grid = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [
            beat({ time: at(10), description: 'Later' }),
            beat({ time: at(0), description: 'Earlier' }),
          ],
        }),
      ),
    )
    expect(grid!.rows[0]!.some((cell) => cell.text.includes('Earlier'))).toBe(true)
  })

  /**
   * **An entry whose time will not parse is left out**, and it does not group
   * with another one - "adjacent" is not a claim you can make about an entry
   * with no position.
   */
  it('leaves out an entry with no usable time', () => {
    const grid = table(
      narrative(
        input({
          id: 'c',
          title: 'Case',
          timeline: [beat({ time: 'not a date' }), beat({ time: null })],
        }),
      ),
    )
    expect(grid).toBeUndefined()
  })

  /** An empty narrative is a sentence, not a table with no rows. */
  it('says so when there is nothing to narrate', () => {
    const nodes = narrative(input({ id: 'c', title: 'Case', timeline: [] }))
    expect(table(nodes)).toBeUndefined()
    expect(nodes.some((node) => node.type === 'prose')).toBe(true)
  })

  /**
   * **Hue is never the sole carrier**, so the one distinction this block makes
   * is named in words as well.
   */
  it('names in words what the colours mean', () => {
    const nodes = narrative(input({ id: 'c', title: 'Case', timeline: [beat()] }))
    const painted = JSON.stringify(nodes).toLowerCase()
    expect(painted).toContain('our action')
    expect(painted).toContain('adversary')
  })

  /**
   * **The legend is one run.**
   */
  it('keys the colours in a single run rather than adjacent emphases', () => {
    const nodes = narrative(input({ id: 'c', title: 'Case', timeline: [beat()] }))
    const legend = nodes.at(-1)
    expect(legend!.type).toBe('richPara')
    expect((legend as { runs: unknown[] }).runs).toHaveLength(1)
  })

  /** The legend is pointless with nothing to key, and clutter on an empty block. */
  it('draws no legend when there is nothing to key', () => {
    const nodes = narrative(input({ id: 'c', title: 'Case', timeline: [] }))
    expect(JSON.stringify(nodes).toLowerCase()).not.toContain('adversary')
  })
})
