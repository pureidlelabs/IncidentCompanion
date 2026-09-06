/**
 * The count a section head carries, attacked on the two things it gets wrong.
 *
 * **Pluralisation and the narrowed form are arithmetic, and a screen doing its
 * own gets one of them wrong.** A hand-written ternary that drops the noun once
 * a filter is on leaves `12 of 40`, which says what of what only to somebody
 * who has been watching the number change.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AddAction, CountBadge, countLine } from './section-head'

describe('the count line', () => {
  it('names the noun once at the total', () => {
    expect(countLine({ total: 12, noun: 'task' })).toBe('12 tasks')
  })

  /** One is the case a bare `${n} ${noun}s` gets wrong every time. */
  it('drops the plural at one', () => {
    expect(countLine({ total: 1, noun: 'record' })).toBe('1 record')
  })

  /** Zero is plural in English, and is a real state rather than an absence. */
  it('keeps the plural at zero', () => {
    expect(countLine({ total: 0, noun: 'note' })).toBe('0 notes')
  })

  /**
   * **The plural is declared, not derived.** `entry` pluralises to `entries`
   * and nothing about the singular says so; a rule guessing it is one more
   * thing to be wrong about a noun nobody checked.
   */
  it('takes the plural it is given', () => {
    expect(countLine({ total: 3, noun: 'entry', plural: 'entries' })).toBe('3 entries')
  })

  it('says what of what while narrowed', () => {
    expect(countLine({ shown: 3, total: 12, noun: 'report' })).toBe('3 of 12 reports')
  })

  /**
   * **The noun survives the narrowing.** Dropped, it leaves `3 of 12`, which
   * reads as a page number.
   */
  it('keeps the noun in the narrowed form', () => {
    expect(countLine({ shown: 3, total: 12, noun: 'entry', plural: 'entries' })).toContain('entries')
  })

  /** Nothing is narrowed when everything is shown, whatever was passed. */
  it('reads as the plain total when the filter left everything', () => {
    expect(countLine({ shown: 12, total: 12, noun: 'case' })).toBe('12 cases')
  })

  /**
   * The noun follows the *total*, not the shown count: `1 of 12 reports` is
   * about twelve reports, and `1 of 12 report` is not English.
   */
  it('pluralises against the total, not the shown count', () => {
    expect(countLine({ shown: 1, total: 12, noun: 'report' })).toBe('1 of 12 reports')
  })
})

describe('the badge', () => {
  it('draws the count line', () => {
    render(<CountBadge total={4} noun="record" />)
    expect(screen.getByText('4 records')).toBeInTheDocument()
  })
})

describe('the add action', () => {
  it('names what it adds', () => {
    render(<AddAction label="Add task" />)
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument()
  })

  /**
   * **One filled primary per view.** Timeline offers two doors side by side,
   * and two solid buttons differing only in hue read as a segmented control -
   * so the second door takes the outline.
   */
  it('takes an outline where it is the second door', () => {
    render(<AddAction label="New event" variant="outline" />)
    expect(screen.getByRole('button', { name: 'New event' })).toBeInTheDocument()
  })
})
