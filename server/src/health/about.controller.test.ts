/**
 * What build this is and under what licence.
 *
 * **The licence is the part worth a test.** It is a legal statement the app
 * makes about itself on a screen an analyst can open, and a wrong one is a
 * wrong claim rather than a cosmetic defect - `AGPL-3.0-only` is the project's,
 * and nothing else may appear there.
 */
import { describe, expect, it } from 'vitest'

import { HealthController } from './health.controller.js'
import { AboutController } from './about.controller.js'
import { ResourcesController } from './resources.controller.js'

const isPublic = (target: object, method: string): boolean =>
  Reflect.getMetadata('PUBLIC', (target as Record<string, () => unknown>)[method]!) === true

describe('what the app says about itself', () => {
  const about = new AboutController().read()

  it('states the project licence exactly', () => {
    expect(about.license).toBe('AGPL-3.0-only')
  })

  it('carries a copyright line', () => {
    expect(about.copyright).toMatch(/©/)
  })

  /**
   * **`internal-dev`, not a number, because no release has been cut.** A
   * version that looks like a release when none exists is the claim to avoid;
   * the Python side says the same string for the same reason.
   */
  it('reports an unreleased build rather than inventing a number', () => {
    expect(about.version).toBe('internal-dev')
  })

  it.each([
    ['siteUrl', 'https://pureidle.dev'],
    ['repoUrl', 'https://github.com/pureidlelabs/IncidentCompanion'],
  ])('serves %s', (field, expected) => {
    expect(about[field as 'siteUrl' | 'repoUrl']).toBe(expected)
  })

  /**
   * **Camel-cased on the wire, because the client reads it that way.** The
   * Python route serves `site_url`; the React client camelises every key at
   * every depth, so it reads `siteUrl` - and a route serving the underscore
   * form to a client that no longer converts would read `undefined`.
   */
  it('names its fields the way the client reads them', () => {
    expect(Object.keys(about).sort()).toEqual([
      'copyright',
      'issuesUrl',
      'license',
      'repoUrl',
      'siteUrl',
      'version',
    ])
  })

  it('points issues at the same repository it names as the source', () => {
    expect(about.issuesUrl.startsWith(about.repoUrl)).toBe(true)
  })
})

/**
 * Who may ask what this build is.
 *
 * **Public, and the sign-in screen is why.** The unauthenticated screens carry
 * an About door, so a session-gated route answers 401 to the one caller most
 * likely to want it - somebody deciding whether to sign into this install at
 * all. Nothing here describes the machine or the case data: it is the version,
 * the licence, the copyright and three URLs that are the same in every copy of
 * this software.
 */
describe('who may read what this build is', () => {
  it('marks the about route public', () => {
    expect(isPublic(AboutController.prototype, 'read')).toBe(true)
  })

  /**
   * **The control for the test above**, and the one that keeps the posture
   * honest. `PUBLIC` metadata being renamed would make `isPublic` answer false
   * everywhere, so the test above would pass while asserting nothing; and a
   * blanket "make the health module public" would take the machine's disk and
   * load with it.
   */
  it('leaves the machine\'s own numbers behind a session', () => {
    expect(isPublic(HealthController.prototype, 'check')).toBe(true)
    expect(isPublic(ResourcesController.prototype, 'read')).toBe(false)
  })
})
