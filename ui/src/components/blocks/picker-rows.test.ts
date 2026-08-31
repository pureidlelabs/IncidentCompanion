import { describe, expect, it } from 'vitest'

import type { CaseSummary } from '@/api/case'

import { matchesCase } from './picker-rows'

/**
 * **The case list searches the Case column and nothing else.**
 *
 * The defect this is written against: the case list's badge read `Case` and
 * matched the customer and the ticket too - three columns under a label
 * promising one.
 *
 * Written from the attack: the assertion that matters is the negative one.
 */

const kase = (over: Partial<CaseSummary> = {}): CaseSummary =>
  ({
    id: 'c1',
    title: 'Meridian Standard ransomware',
    customer: 'Northgate Logistics',
    reference: 'INC-4471',
    status: 'open',
    ...over,
  }) as CaseSummary

describe('the case list search reads the Case column', () => {
  it('matches a word in the title', () => {
    expect(matchesCase(kase(), 'ransomware')).toBe(true)
  })

  it.each([
    ['Customer', 'northgate'],
    ['Ticket', 'inc-4471'],
  ])('refuses a value that is only in %s', (_column, term) => {
    expect(matchesCase(kase(), term)).toBe(false)
  })

  it('is AND across terms, in either order', () => {
    expect(matchesCase(kase(), 'mer ran')).toBe(true)
    expect(matchesCase(kase(), 'ran mer')).toBe(true)
    expect(matchesCase(kase(), 'mer northgate')).toBe(false)
  })
})
