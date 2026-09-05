/**
 * What build this is and under what licence.
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
   * **`internal-dev`, not a number, because no release has been cut.**
   */
  it('reports an unreleased build rather than inventing a number', () => {
    expect(about.version).toBe('internal-dev')
  })

  it.each([
    ['siteUrl', 'https://incidentcompanion.com'],
    ['makerUrl', 'https://pureidle.dev'],
    ['repoUrl', 'https://github.com/pureidlelabs/IncidentCompanion'],
  ])('serves %s', (field, expected) => {
    expect(about[field as 'siteUrl' | 'repoUrl']).toBe(expected)
  })

  /**
   * **Camel-cased on the wire, because the client reads it that way.**
   */
  it('names its fields the way the client reads them', () => {
    expect(Object.keys(about).sort()).toEqual([
      'copyright',
      'issuesUrl',
      'license',
      'makerUrl',
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
 */
describe('who may read what this build is', () => {
  it('marks the about route public', () => {
    expect(isPublic(AboutController.prototype, 'read')).toBe(true)
  })

  /**
   * **The control for the test above**, and the one that keeps the posture
   * honest.
   */
  it('leaves the machine\'s own numbers behind a session', () => {
    expect(isPublic(HealthController.prototype, 'check')).toBe(true)
    expect(isPublic(ResourcesController.prototype, 'read')).toBe(false)
  })
})
