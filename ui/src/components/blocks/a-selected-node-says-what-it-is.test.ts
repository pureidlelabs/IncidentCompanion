import { describe, expect, it } from 'vitest'

import type { IncidentNode } from './incident-graph'
import { selectionSummary } from './incident-selection'

const node = (): IncidentNode =>
  ({
    id: 'n1',
    label: 'Ransomware deployment detected',
    kind: 'event',
    count: 1,
    severity: 'high',
    bridge: false,
    spans: 1,
    entry: false,
  }) as IncidentNode

describe('the line over a selected node', () => {
  it('names the severity an event carries', () => {
    expect(selectionSummary(node())).toBe('Event \u00b7 high')
  })

  /**
   * The timeline draws `unset` for the same entry, and the event that has not
   * been rated is the one an analyst is looking for. -> #983
   */
  it('says the severity is unset rather than leaving it out', () => {
    expect(selectionSummary({ ...node(), severity: '' })).toBe('Event \u00b7 unset')
  })

  /** An entity has no severity to be unset, so it claims none. */
  it('says nothing about severity for an entity that has none', () => {
    const system = { ...node(), kind: 'system', severity: '', label: 'FIN-WS-01' }
    expect(selectionSummary(system)).not.toContain('unset')
  })

  it('keeps the rest of the line, in order', () => {
    const folded = { ...node(), count: 3, bridge: true, spans: 2, entry: true }
    expect(selectionSummary(folded)).toBe(
      'Event \u00b7 high \u00b7 3 together \u00b7 in 2 kinds of event \u00b7 entry point',
    )
  })
})
