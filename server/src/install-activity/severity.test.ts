/**
 * A run of failures is what the audit raises, so every failure has to be in it.
 *
 * `read.test.ts` demonstrates the raise end to end for `sign_in_failed`, over
 * a real table. This holds the other half, which that test cannot see: the
 * property is claimed for *every* event an attack shows up as, and an event
 * added to the vocabulary without being added to `FAILURES` is one whose run
 * never raises and whose absence nothing reports.
 *
 * What this does not cover is whether a run is *counted* correctly, which is
 * the window in `install-audit/read.service.ts` and `read.test.ts`'s subject.
 */
import { describe, expect, it } from 'vitest'

import { FAILURES, RUN_IS_AN_ATTACK, outcomeOf, severityOf } from './severity.js'

/**
 * Named here rather than taken from `FAILURES`, because a test that iterates
 * the set it is checking asserts nothing about the set.
 *
 * Emptying `FAILURES` turns every `it.each` below into zero tests and leaves
 * the suite green -- measured -- while `outcomeOf('sign_in_failed')` starts
 * answering `success` and no refusal ever raises. This list is what fails
 * instead.
 */
const EVERY_FAILURE = ['sign_in_failed', 'access_denied', 'live_refused', 'rate_limited'] as const

describe('the set a run is raised over', () => {
  it('is exactly the events an attack shows up as', () => {
    expect([...FAILURES].sort()).toEqual([...EVERY_FAILURE].sort())
  })

  it('is not empty, which would make every test below vacuous', () => {
    expect(FAILURES.size).toBe(EVERY_FAILURE.length)
  })
})

describe('a run of failures', () => {
  it.each(EVERY_FAILURE)('raises %s to High once it is a run', (event) => {
    expect(severityOf({ event, runLength: RUN_IS_AN_ATTACK })).toBe('High')
  })

  it.each(EVERY_FAILURE)('leaves a single %s below High', (event) => {
    expect(severityOf({ event, runLength: 1 })).not.toBe('High')
  })

  it.each(EVERY_FAILURE)(
    'reports %s as a failure, which is what a collector filters on',
    (event) => {
      expect(outcomeOf(event)).toBe('failure')
    },
  )

  /**
   * The boundary itself, because an off-by-one here is invisible: the level is
   * only ever read beside a count nobody checks by hand.
   */
  it('does not raise one short of a run', () => {
    for (const event of EVERY_FAILURE) {
      expect(severityOf({ event, runLength: RUN_IS_AN_ATTACK - 1 })).not.toBe('High')
    }
  })
})
