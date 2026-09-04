import { describe, expect, it, vi } from 'vitest'

import { inWords, sessionBounds } from './session-bounds'

const idle = { value: 45, floor: 5, ceiling: 720 }
const lifetime = { value: 480, floor: 30, ceiling: 1440 }

describe('the two session windows as rows', () => {
  it('says an hour in hours and anything else in minutes', () => {
    expect(inWords(45)).toBe('45 minutes')
    expect(inWords(60)).toBe('1 hour')
    expect(inWords(480)).toBe('8 hours')
    // Not a whole number of hours, so the unit that states it exactly wins.
    expect(inWords(90)).toBe('90 minutes')
  })

  it('offers what the install is set to, even where it is not a step', () => {
    const [window] = sessionBounds({ idle: { ...idle, value: 7 }, lifetime }, vi.fn())
    expect(window?.chosen).toBe('7 minutes')
    expect(window?.choices).toContain('7 minutes')
  })

  it('offers nothing the server would refuse', () => {
    const [window] = sessionBounds({ idle: { ...idle, ceiling: 60 }, lifetime }, vi.fn())
    expect(window?.choices).toContain('1 hour')
    expect(window?.choices).not.toContain('2 hours')
  })

  it('writes the number the label stands for, not the label', () => {
    const set = vi.fn()
    const [window] = sessionBounds({ idle, lifetime }, set)
    window?.onChoose?.('2 hours')
    expect(set).toHaveBeenCalledWith('auth.sessionIdleMinutes', 120)
  })

  it('draws nothing where the install has not answered', () => {
    expect(sessionBounds({ idle: undefined, lifetime: undefined }, vi.fn())).toEqual([])
  })

  /**
   * A row whose choice cannot be written is a control that reports a change
   * the install never kept, so an unreadable label writes nothing at all.
   */
  it('writes nothing for a label it does not know', () => {
    const set = vi.fn()
    const [window] = sessionBounds({ idle, lifetime }, set)
    window?.onChoose?.('a fortnight')
    expect(set).not.toHaveBeenCalled()
  })
})
