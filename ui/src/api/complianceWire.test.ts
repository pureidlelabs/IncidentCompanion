/**
 * The compliance boundary, attacked rather than demonstrated.
 *
 * Each case here is a way the screen could send something the column refuses
 * or, worse, accepts as an answer nobody gave.
 */
import { describe, expect, it } from 'vitest'

import { valueFor, wireValue } from './complianceWire'
import type { ComplianceFieldSpec } from './specs'

const spec = (over: Partial<ComplianceFieldSpec>): ComplianceFieldSpec =>
  ({ name: 'x', label: 'X', kind: 'text', ...over }) as ComplianceFieldSpec

describe('reading a value out of the record', () => {
  it('joins a set with the separator its descriptor names', () => {
    const states = spec({ name: 'affectedMemberStates', kind: 'multi_csv', join: ',' })
    expect(valueFor({ affectedMemberStates: ['AT', 'BE'] }, states)).toBe('AT,BE')

    const causes = spec({ name: 'doraRootCauseHigh', kind: 'multi_lines', join: '\n' })
    expect(valueFor({ doraRootCauseHigh: ['human error', 'external event'] }, causes)).toBe(
      'human error\nexternal event',
    )
  })

  it('shows an unanswered ground as empty and an unset tickbox as false', () => {
    expect(valueFor({ nis2Death: null }, spec({ name: 'nis2Death', kind: 'ground' }))).toBe('')
    expect(
      valueFor({ serviceDowntimeComplete: null }, spec({ name: 'serviceDowntimeComplete', kind: 'check' })),
    ).toBe(false)
  })

  it('keeps a zero rather than showing it as unanswered', () => {
    // `0 || ''` is the shape that loses this, and a downtime of 0 minutes is a
    // measurement - the outage was caught before it bit.
    expect(
      valueFor(
        { serviceDowntimeMinutes: 0 },
        spec({ name: 'serviceDowntimeMinutes', kind: 'number' }),
      ),
    ).toBe(0)
  })
})

describe('writing a value back', () => {
  it('splits a set and drops the empty members a joined string carries', () => {
    const states = spec({ name: 'affectedMemberStates', kind: 'multi_csv', join: ',' })
    expect(wireValue(states, 'AT,,BE, ')).toEqual(['AT', 'BE'])
    expect(wireValue(states, '')).toEqual([])
  })

  it('sends null for a ground nobody answered, never an empty string', () => {
    // The column is text, so `''` would store and read back as an answer of
    // its own - and every lens counting answered thresholds would count it.
    expect(wireValue(spec({ kind: 'ground' }), '')).toBeNull()
    expect(wireValue(spec({ kind: 'select' }), '')).toBeNull()
    expect(wireValue(spec({ kind: 'ground' }), 'no')).toBe('no')
  })

  it('keeps an emptied note as an empty string, because clearing text is an edit', () => {
    expect(wireValue(spec({ kind: 'text' }), '')).toBe('')
  })

  it('does not turn an emptied count into zero', () => {
    // `Number('')` is 0. Saved, that says nobody was affected.
    expect(wireValue(spec({ kind: 'number' }), '')).toBeNull()
    expect(wireValue(spec({ kind: 'number' }), '0')).toBe(0)
    expect(wireValue(spec({ kind: 'number' }), 'not a number')).toBeNull()
  })
})
