/**
 * Two visitors of one published build hold two cases, and a reset hands back
 * the case as published.
 *
 * *Work done in the evaluation build SHALL be visible only to the person who
 * did it, and SHALL NOT reach another visitor. The visitor SHALL be able to
 * return to the case as first published, discarding what they have done.*
 *
 * > #### Scenario: Two people open the same published build
 * > - WHEN one of them writes to the case
 * > - THEN the other does not see it
 *
 * > #### Scenario: The visitor wants a clean case
 * > - WHEN they ask to start again
 * > - THEN the case is as first published
 * > - AND what they had written is gone
 *
 * **Both scenarios are the same property, and it has one failure mode.** The
 * published case is a module-level JSON import that every visitor's state is
 * cloned from; a handler writing through the clone into that import gives the
 * next visitor somebody else's work and gives the resetting visitor their own
 * back. Two visitors and a reset are the two ways that failure is seen.
 *
 * **Asserted whole rather than per collection.** `handler.test.ts` covers the
 * timeline not reaching the seed; a write landing in the shared import through
 * any other collection is the same defect and would pass that case. So the
 * second visitor's case is compared with a third, untouched one in its
 * entirety, and every collection the demo serves is written to first.
 *
 * **The writes are asserted to have landed.** A handler refusing all four
 * leaves the second visitor's case identical for the wrong reason, which is the
 * pass this test would otherwise hand out.
 *
 * **What this does not cover:** that a visitor's case is kept in the browser
 * rather than on a server. The store is IndexedDB, no test environment here
 * provides one, and it is a claim about `store.ts` rather than about what a
 * write does.
 */
import { describe, expect, it } from 'vitest'

import { handle } from './handler'
import { freshState, type DemoState } from './state'

/** One write per collection the demo takes, so no path into the seed is left out. */
const WRITES = [
  ['timeline', { kind: 'event', description: 'Only mine', time: '2026-01-01T00:00:00Z' }],
  ['systems', { hostname: 'only-mine', type: 'workstation' }],
  ['accounts', { accountName: 'only.mine', domain: 'mine.test' }],
  ['casenotes', { note: 'Only mine' }],
] as const

const post = async (state: DemoState, collection: string, row: unknown) =>
  handle(state, `/api/cases/${state.kase.id}/${collection}`, {
    method: 'POST',
    body: JSON.stringify(row),
  })

const rowsIn = async (state: DemoState, collection: string) =>
  (await (await handle(state, `/api/cases/${state.kase.id}/${collection}`, {})).json()) as unknown[]

describe('two visitors of one published build', () => {
  it('each write lands for the visitor who made it, so the absences below mean something', async () => {
    const mine = freshState()

    for (const [collection, row] of WRITES) {
      const before = (await rowsIn(mine, collection)).length
      const answer = await post(mine, collection, row)

      expect(
        answer.status,
        `the demo refused a write to ${collection}, so this visitor wrote nothing and the ` +
          'other visitor seeing nothing says nothing',
      ).toBeLessThan(300)
      expect(
        (await rowsIn(mine, collection)).length,
        `${collection} is the same length after a write, so nothing was added`,
      ).toBe(before + 1)
    }
  })

  it('keeps what one visitor wrote out of the case the next one opens', async () => {
    const published = structuredClone(freshState())
    const mine = freshState()
    const theirs = freshState()

    for (const [collection, row] of WRITES) await post(mine, collection, row)

    expect(
      theirs,
      'a second visitor opening the same published build is handed what the first wrote, ' +
        'so the evaluation build shows every visitor what everybody else has written',
    ).toEqual(published)
  })

  it('hands back the case as published when a visitor starts again', async () => {
    const mine = freshState()
    for (const [collection, row] of WRITES) await post(mine, collection, row)

    const again = freshState()

    expect(
      again,
      'starting again returns a case that still carries what was written, so a visitor ' +
        'cannot get back to what they were shown',
    ).toEqual(freshState())

    for (const [collection] of WRITES) {
      expect(
        JSON.stringify(await rowsIn(again, collection)),
        `${collection} still holds a row from the previous visit after starting again`,
      ).not.toContain('Only mine')
    }
  })
})
