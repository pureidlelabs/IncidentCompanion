/**
 * **What level each published route needs, asked of every one of them.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { levelNeeded } from '../src/access/case-access.guard.js'
import { boot, bootable, operations, type Harness } from './app-harness.js'

const runnable = await bootable()

/** The published template's segments, with the `/api` prefix included. */
const segmentsOf = (template: string): string[] => template.split('/').filter(Boolean)

/**
 * Whether a published template addresses one case and nothing inside it.
 */
function isTheCaseItself(template: string): boolean {
  const segments = segmentsOf(template)
  const at = segments.indexOf('cases')
  return at !== -1 && segments.length === at + 2 && segments[at + 1]!.startsWith('{')
}

describe.skipIf(!runnable)('what level every published route needs', () => {
  let harness: Harness
  let published: { method: string; template: string }[]

  beforeAll(async () => {
    harness = await boot()
    published = operations(harness.document).map((one) => ({
      method: one.method,
      template: one.template,
    }))
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The vacuity guard.**
   */
  it('finds a route table to sweep', () => {
    expect(published.length).toBeGreaterThan(100)
    expect(published.filter((one) => one.template.includes('/cases/{')).length).toBeGreaterThan(20)
  })

  /**
   * **The requirement, quantified.**
   */
  it('needs delete for exactly the routes that address a case itself', () => {
    const wrong: string[] = []
    for (const { method, template } of published) {
      if (method !== 'DELETE') continue
      const wanted = isTheCaseItself(template) ? 'delete' : 'write'
      const answered = levelNeeded(method, template)
      if (answered !== wanted) wrong.push(`${method} ${template}: wanted ${wanted}, got ${answered}`)
    }
    expect(wrong, 'the level derivation disagrees with the specification').toEqual([])
  })

  it('publishes exactly one route that destroys a case', () => {
    const destroying = published.filter(
      (one) => levelNeeded(one.method, one.template) === 'delete',
    )
    expect(destroying.map((one) => `${one.method} ${one.template}`)).toEqual([
      'DELETE /api/cases/{caseId}',
    ])
  })

  /**
   * **Nothing that only reads may need more than read**, and nothing that writes
   * may be answered as a read.
   */
  it('answers read for every safe method and never for an unsafe one', () => {
    const wrong: string[] = []
    for (const { method, template } of published) {
      const answered = levelNeeded(method, template)
      const safe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
      if (safe && answered !== 'read') wrong.push(`${method} ${template} reads at ${answered}`)
      if (!safe && answered === 'read') wrong.push(`${method} ${template} writes at read`)
    }
    expect(wrong).toEqual([])
  })

  /**
   * **The route that is right for the wrong reason, pinned.**
   */
  it('does not read a personal recent-list entry as the case itself', () => {
    const recents = published.filter((one) => one.template.includes('recent-cases'))
    expect(recents.length, 'the recent-cases routes have moved or gone').toBeGreaterThan(0)
    for (const { method, template } of recents) {
      expect(levelNeeded(method, template), `${method} ${template}`).not.toBe('delete')
    }
  })

  /**
   * **A method nobody has added yet is a write.**
   */
  it.each(['PURGE', 'MOVE', 'LOCK', ''])('treats the unknown method %j as a write', (method) => {
    expect(levelNeeded(method, '/api/cases/{caseId}')).toBe('write')
  })
})
