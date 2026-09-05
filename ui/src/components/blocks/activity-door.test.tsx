import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActivityEntry } from '@/api/activity'

import { ActivityDoor } from './activity-door'

/**
 * **The mark, and the clock the door does not run.**
 *
 * The panel itself is `ActivityFeed`, which has its own file. What is asserted
 * here is the half a rewrite gets wrong silently: which writes count as new,
 * and that nothing here installs a timer.
 *
 * The panel's contents are not asserted from this file. It is a React Aria
 * overlay animated by Motion, and Motion does not run in jsdom - so a closed
 * panel and an open one that never finished entering are the same DOM. The
 * browser tier is what says the feed shows.
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
   * **A case opened for the first time is not marked.** With no record of what
   * the analyst has been shown, every write it has ever had is "new" - which
   * badges a case nobody has touched in a month and says nothing.
   */
  it('marks nothing where the caller knows of no earlier look', () => {
    render(<ActivityDoor entries={[entry(9, 1000), entry(8, 900)]} />)
    expect(screen.queryByTestId('activity-dot')).toBeNull()
    expect(screen.getByTestId('activity-door').getAttribute('aria-label')).toBe('Case activity')
  })

  /**
   * **Newer, not as-new-as.** `>=` against the last-seen sequence marks the
   * very write the analyst has already read, so the dot never clears - and it
   * renders identically to a dot that is telling the truth.
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
   *
   * Reading `entries[0].seq` assumes the route served them newest first. It
   * does - until a caller sorts them for a screen, or an entry arrives over the
   * socket and is appended. The dot then stops appearing, and a header that
   * never marks anything looks exactly like a quiet case.
   */
  it('finds the newest write wherever it sits in the list', () => {
    render(<ActivityDoor entries={[entry(4, 900), entry(11, 1000), entry(7, 950)]} seen={8} />)
    expect(screen.getByTestId('activity-dot')).toBeInTheDocument()
  })

  /**
   * **No timer.** The figures inside are hour and minute counts; a timer
   * redrawing them every second spends a wake-up a second to move a digit every
   * sixty, and it runs whether or not the panel has ever been opened.
   */
  it('installs no timer', () => {
    const interval = vi.spyOn(globalThis, 'setInterval')
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    render(<ActivityDoor entries={[entry(9, 1000)]} seen={8} />)
    expect(interval).not.toHaveBeenCalled()
    expect(timeout).not.toHaveBeenCalled()
  })
})
