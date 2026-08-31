/**
 * Ordering the case switcher, and moving a pin optimistically.
 *
 * **Both are pure and both are where the defect hides.** The request being
 * right says nothing about the order the analyst sees, and the optimistic move
 * is the one that renders before the server ever answers.
 */
import { describe, expect, it } from 'vitest'

import { byRecency, hintsFor, movePin, type RecentCase, type RecentCases } from './recentCases'

function visit(caseId: string, over: Partial<RecentCase> = {}): RecentCase {
  return {
    caseId,
    title: caseId,
    reference: null,
    customer: null,
    status: 'open',
    section: 'timeline',
    visitedAt: '2026-08-10T10:00:00.000Z',
    pinned: false,
    ...over,
  }
}

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('ordering the switcher by what the server has seen', () => {
  it('leads with the most recently visited', () => {
    const held: RecentCases = { pinned: [], recent: [visit('c'), visit('a')] }

    expect(byRecency(rows, held).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  /** A pin is a decision; it outranks a visit that happens to be newer. */
  it('leads with pins before visits', () => {
    const held: RecentCases = { pinned: [visit('b', { pinned: true })], recent: [visit('c')] }

    expect(byRecency(rows, held).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  /**
   * **A case nobody has opened keeps the order it arrived in.** Sorting the
   * remainder by id would override the server's own ordering with a string
   * comparison of uuids, which is no order at all.
   */
  it('leaves untouched cases in the order the caller had them', () => {
    const held: RecentCases = { pinned: [], recent: [] }

    expect(byRecency(rows, held).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('is unbothered by a list that has not arrived', () => {
    expect(byRecency(rows, undefined).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  /** A visit naming a case this list does not hold must not drop the rest. */
  it('ignores a visit to a case that is not in the list', () => {
    const held: RecentCases = { pinned: [], recent: [visit('gone'), visit('b')] }

    expect(byRecency(rows, held).map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('moving a pin before the server answers', () => {
  it('lifts the case to the top of the pinned list', () => {
    const held: RecentCases = {
      pinned: [visit('p', { pinned: true })],
      recent: [visit('x', { visitedAt: '2026-08-10T09:00:00.000Z' })],
    }

    const after = movePin(held, 'x', true)

    expect(after.pinned.map((r) => r.caseId)).toEqual(['x', 'p'])
    expect(after.recent).toEqual([])
  })

  /**
   * **An unpin lands by when it was visited, not at the top.** Dropping it in
   * at the front is the spelling that looks right until the list is re-read and
   * the row jumps somewhere else.
   */
  it('drops an unpinned case back among the rest by visit time', () => {
    const held: RecentCases = {
      pinned: [visit('p', { pinned: true, visitedAt: '2026-08-10T08:00:00.000Z' })],
      recent: [
        visit('new', { visitedAt: '2026-08-10T12:00:00.000Z' }),
        visit('old', { visitedAt: '2026-08-10T06:00:00.000Z' }),
      ],
    }

    const after = movePin(held, 'p', false)

    expect(after.pinned).toEqual([])
    expect(after.recent.map((r) => r.caseId)).toEqual(['new', 'p', 'old'])
  })

  it('leaves the lists alone for a case it does not hold', () => {
    const held: RecentCases = { pinned: [], recent: [visit('x')] }

    expect(movePin(held, 'not-here', true)).toBe(held)
  })
})

describe('telling two pinned rows apart', () => {
  it('shows the reference and customer when there are any', () => {
    const hints = hintsFor([visit('a', { title: 'Breach', reference: 'INC-1', customer: 'Acme' })])

    expect(hints.get('a')).toBe('INC-1 \u00b7 Acme')
  })

  it('shows nothing extra for a case with neither, when nothing collides', () => {
    const hints = hintsFor([visit('a', { title: 'Alone' })])

    expect(hints.get('a')).toBe('')
  })

  /**
   * **The case an analyst actually hit**: two cases called `test`, no reference
   * and no customer on either, so the rows were the same row twice.
   */
  it('falls back to a short id when two rows would read identically', () => {
    const hints = hintsFor([
      visit('6e41af15-265b-4168-aaaa-000000000001', { title: 'test' }),
      visit('9a02bc77-1111-4444-bbbb-000000000002', { title: 'test' }),
    ])

    expect(hints.get('6e41af15-265b-4168-aaaa-000000000001')).toBe('6e41af15')
    expect(hints.get('9a02bc77-1111-4444-bbbb-000000000002')).toBe('9a02bc77')
  })

  /** A uuid on a row that never needed one is the noise this avoids. */
  it('leaves an unambiguous row alone when a different pair collides', () => {
    const hints = hintsFor([
      visit('id-clear', { title: 'Distinct' }),
      visit('id-one', { title: 'test' }),
      visit('id-two', { title: 'test' }),
    ])

    expect(hints.get('id-clear')).toBe('')
    expect(hints.get('id-one')).toBe('id-one')
  })

  /** Same title, different customer: already tellable apart, so no id. */
  it('does not call it a collision when the customer already differs', () => {
    const hints = hintsFor([
      visit('a', { title: 'test', customer: 'Acme' }),
      visit('b', { title: 'test', customer: 'Northwind' }),
    ])

    expect(hints.get('a')).toBe('Acme')
    expect(hints.get('b')).toBe('Northwind')
  })
})
