/**
 * **The level is asked before the act**, which is the half `reach.service.ts`
 * deliberately does not do.
 *
 * Two scenarios of `openspec/specs/accounts-and-access` turn on the
 * distinction the specification draws in one sentence -- *Delete is about the
 * case as a whole and nothing smaller*:
 *
 * - an analyst at read and write removes an entry, an entity, a piece of
 *   evidence or a report section, and it is removed;
 * - the same analyst attempts to delete the case itself, and it is refused.
 *
 * **The level a route needs is derived from the request, not declared on it.**
 * A decorator per route is written by whoever adds the route, at the moment
 * they add it, which is the same person and moment as the route that forgot -
 * the argument every sweep in this tree makes. So a new route is covered the
 * day it is added, and the derivation is what this file asserts.
 */
import { describe, expect, it } from 'vitest'

import { levelNeeded } from './case-access.guard.js'

describe('what level an act needs', () => {
  it('reads at read', () => {
    expect(levelNeeded('GET', '/api/cases/abc')).toBe('read')
    expect(levelNeeded('GET', '/api/cases/abc/timeline')).toBe('read')
    expect(levelNeeded('HEAD', '/api/cases/abc/systems')).toBe('read')
  })

  /**
   * *An analyst removes something inside a case.* Everything inside a case is
   * the analyst's working material, and taking a wrong entry out is ordinary
   * work rather than destruction - so each of these is `write`, not `delete`.
   */
  it.each([
    '/api/cases/abc/timeline/def',
    '/api/cases/abc/systems/def',
    '/api/cases/abc/evidence/def',
    '/api/cases/abc/report_blocks/def',
    '/api/cases/abc/bulk',
  ])('removes %s at write', (path) => {
    expect(levelNeeded('DELETE', path)).toBe('write')
  })

  it('changes what a case holds at write', () => {
    expect(levelNeeded('PATCH', '/api/cases/abc')).toBe('write')
    expect(levelNeeded('POST', '/api/cases/abc/timeline')).toBe('write')
    expect(levelNeeded('PUT', '/api/cases/abc/compliance')).toBe('write')
  })

  /**
   * *An analyst attempts to delete the case itself.* The only act that needs
   * `delete`, and it is told apart by the path ending at the case rather than
   * by a list of the paths that do not.
   */
  it('destroys the case itself at delete', () => {
    expect(levelNeeded('DELETE', '/api/cases/abc')).toBe('delete')
  })

  it('is not fooled by a trailing slash', () => {
    expect(levelNeeded('DELETE', '/api/cases/abc/')).toBe('delete')
  })

  /**
   * **A query string is not a path segment.** Without this, `DELETE
   * /api/cases/abc?force=1` would read as deleting something inside the case
   * and pass at `write` - the weaker level, which is the direction that
   * matters.
   */
  it('is not fooled by a query string', () => {
    expect(levelNeeded('DELETE', '/api/cases/abc?confirm=yes')).toBe('delete')
  })

  /**
   * **An unknown method is treated as a write, not as a read.** Guessing wrong
   * on a method nobody has added yet should cost an analyst a refusal rather
   * than cost a customer a write nobody was entitled to.
   */
  it('treats a method it does not know as a write', () => {
    expect(levelNeeded('PROPFIND', '/api/cases/abc/timeline')).toBe('write')
  })
})
