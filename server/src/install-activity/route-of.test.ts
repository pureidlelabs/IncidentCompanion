/**
 * The audit's route name, attacked: can a caller put their own text in it?
 *
 * `target` is a partition column of the run window (`install-audit/read.service.ts`),
 * so a caller who can vary it keeps every one of their refusals a run of one.
 * That makes "where does this string come from" a security question rather
 * than a formatting one. -> #541
 */
import type { Request } from 'express'
import { describe, expect, it } from 'vitest'

import { UNMATCHED, routeOf } from './route-of.js'

/** Only the two fields `routeOf` reads. */
const asking = (path: string, matched?: string) =>
  ({ path, ...(matched === undefined ? {} : { route: { path: matched } }) }) as unknown as Request

describe('the route an audit line is filed under', () => {
  it('is the pattern the router matched, not the path that was typed', () => {
    expect(
      routeOf(asking('/api/cases/11111111-1111-4111-8111-111111111111', '/api/cases/:caseId')),
    ).toBe('/api/cases/:caseId')
  })

  /**
   * The whole point. A path is whatever the caller sent, so returning it hands
   * them the partition key: two requests differing by one character are two
   * runs of one rather than one run of two.
   */
  it('never answers with the caller`s own path when no route matched', () => {
    const one = routeOf(asking('/nothing/here?a=1'))
    const two = routeOf(asking('/nothing/here?a=2'))

    expect(one).toBe(UNMATCHED)
    expect(two, 'two unmatched paths gave two targets, so the caller picks the run').toBe(one)
    expect(one).not.toContain('nothing')
  })

  it('answers the same for a route object carrying no usable path', () => {
    expect(routeOf({ path: '/x', route: { path: 7 } } as unknown as Request)).toBe(UNMATCHED)
  })
})
