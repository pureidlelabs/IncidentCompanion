/**
 * **The rule that decides whether 96 beacons are one row or ninety-six.**
 *
 * Written against the two properties that were argued over rather than against
 * "it groups things": adjacency splits a run, and a null key never groups at
 * all.
 */
import { describe, expect, it } from 'vitest'

import { consecutiveRuns } from './runs.js'

const of = (word: string) => word

describe('grouping neighbouring entries', () => {
  it('folds a burst of identical entries into one run', () => {
    const beacons = Array.from({ length: 96 }, () => 'beacon')
    expect(consecutiveRuns(beacons, of)).toHaveLength(1)
    expect(consecutiveRuns(beacons, of)[0]).toHaveLength(96)
  })

  /**
   * **No time window, deliberately.** A gate on elapsed time produces a cliff:
   * identical entries five minutes apart collapse and the same entries thirty
   * minutes apart do not, which is a beacon interval nobody would call
   * unusual.
   */
  it('groups on identity alone, however far apart the entries are', () => {
    expect(consecutiveRuns(['a', 'a'], of)).toHaveLength(1)
  })

  it('does not fold a recurrence back into the burst before it', () => {
    const runs = consecutiveRuns(['a', 'a', 'b', 'a'], of)
    expect(runs.map((run) => run.length)).toEqual([2, 1, 1])
  })

  it('never groups an entry whose key is null', () => {
    expect(consecutiveRuns(['x', 'x'], () => null)).toHaveLength(2)
  })

  it('answers nothing for nothing', () => {
    expect(consecutiveRuns([], of)).toEqual([])
  })
})
