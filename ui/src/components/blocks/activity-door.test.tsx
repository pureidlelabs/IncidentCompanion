import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActivityEntry } from '@/api/activity'

import { ActivityDoor } from './activity-door'

/**
 * **The mark, and the clock the door does not run.**
 */
const entry = (seq: number, at: number): ActivityEntry => ({
  seq,
  entity: 'systems',
  entityId: `sys-${String(seq)}`,
  op: 'update',
  version: 1,
  by: 'Joy Okonkwo',
  at,
  fields: ['status'],
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the activity door marks what is new', () => {
  /**
   * **A case opened for the first time is not marked.**
   */
  it('marks nothing where the caller knows of no earlier look', () => {
    render(<ActivityDoor entries={[entry(9, 1000), entry(8, 900)]} />)
    expect(screen.queryByTestId('activity-dot')).toBeNull()
    expect(screen.getByTestId('activity-door').getAttribute('aria-label')).toBe('Case activity')
  })

  /**
   * **Newer, not as-new-as.**
   */
  it('leaves the newest entry the analyst has already seen unmarked', () => {
    render(<ActivityDoor entries={[entry(9, 1000), entry(8, 900)]} seen={9} />)
    expect(screen.queryByTestId('activity-dot')).toBeNull()
  })

  /** One write past the last look is the whole of what the dot claims. */
  it('marks a write that arrived since the last look', () => {
    render(<ActivityDoor entries={[entry(9, 1000), entry(8, 900)]} seen={8} />)
    expect(screen.getByTestId('activity-dot')).toBeInTheDocument()
    expect(screen.getByTestId('activity-door').getAttribute('aria-label')).toBe(
      'Case activity, new since you last looked',
    )
  })

  /**
   * **The newest is the highest sequence, not the first row.**
   */
  it('finds the newest write wherever it sits in the list', () => {
    render(<ActivityDoor entries={[entry(4, 900), entry(11, 1000), entry(7, 950)]} seen={8} />)
    expect(screen.getByTestId('activity-dot')).toBeInTheDocument()
  })

  it('installs no timer', () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    render(<ActivityDoor entries={[entry(9, 1000)]} seen={8} />)
    expect(interval).not.toHaveBeenCalled()
    expect(timeout).not.toHaveBeenCalled()
  })
})
