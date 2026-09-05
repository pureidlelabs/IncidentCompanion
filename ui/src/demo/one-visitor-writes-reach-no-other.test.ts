/**
 * Two visitors of one published build hold two cases, and a reset hands back
 * the case as published.
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
