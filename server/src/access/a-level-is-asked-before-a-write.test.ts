/**
 * **The level is asked before the act**, which is the half `reach.service.ts`
 * deliberately does not do.
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

  /** A trailing slash is the same request, and must not change the answer. */
  it('is not fooled by a trailing slash', () => {
    expect(levelNeeded('DELETE', '/api/cases/abc/')).toBe('delete')
  })

  it('is not fooled by a query string', () => {
    expect(levelNeeded('DELETE', '/api/cases/abc?confirm=yes')).toBe('delete')
  })

  it('treats a method it does not know as a write', () => {
    expect(levelNeeded('PROPFIND', '/api/cases/abc/timeline')).toBe('write')
  })
})
