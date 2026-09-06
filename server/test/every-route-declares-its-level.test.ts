/**
 * **What level each published route needs, asked of every one of them.**
 *
 * Derived from `openspec/specs/accounts-and-access/spec.md`, which quantifies:
 *
 * > Delete is about the case as a whole and nothing smaller.
 *
 * That is a claim about **every** route, not about the ones somebody thought
 * of. `access/a-level-is-asked-before-a-write.test.ts` asserts the derivation
 * against hand-written path strings, which can only ever contain the paths its
 * author anticipated -- and a hand-written subject list is the shape an
 * escalation passes through, found by a reader rather than by the suite.
 *
 * So the subject list here is **the route table the application publishes**. A
 * route added tomorrow is covered the day it is added, which is the same
 * argument the guard itself makes for deriving the level rather than declaring
 * it per route.
 *
 * **This asserts the derivation, not the enforcement.** Whether the guard is
 * mounted is `access/case-routes-guarded.test.ts`; whether it refuses a caller
 * who holds too little is `test/the-level-survives-the-spelling.test.ts`. This
 * file answers only: for each route the product publishes, is the level the
 * specification asks for the level the derivation answers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { levelNeeded } from '../src/access/case-access.guard.js'
import { boot, bootable, operations, type Harness } from './app-harness.js'

const runnable = await bootable()

/** The published template's segments, with the `/api` prefix included. */
const segmentsOf = (template: string): string[] => template.split('/').filter(Boolean)

/**
 * Whether a published template addresses one case and nothing inside it.
 *
 * **Worked out from the template independently of `levelNeeded`.** Deriving it
 * from the function under test is the trap this whole file exists to avoid: it
 * would assert the constant against itself and pass for ever.
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
   * **The vacuity guard.** A sweep over an empty route table satisfies every
   * assertion below it and reports the application clean, which is how a
   * quantified test goes quietly wrong.
   */
  it('finds a route table to sweep', () => {
    expect(published.length).toBeGreaterThan(100)
    expect(published.filter((one) => one.template.includes('/cases/{')).length).toBeGreaterThan(20)
  })

  /**
   * **The requirement, quantified.** Every published DELETE either addresses
   * the case itself and needs `delete`, or addresses something inside it and
   * needs `write` -- *"everything inside a case is the analyst's working
   * material, and taking a wrong entry out is ordinary work rather than
   * destruction."*
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

  /**
   * **Exactly one route destroys a case**, and the count is the assertion. A
   * second one appearing is either a duplicate door or a route that should
   * have been scoped inside the case, and both are worth failing on.
   */
  it('publishes exactly one route that destroys a case', () => {
    const destroying = published.filter(
      (one) => levelNeeded(one.method, one.template) === 'delete',
    )
    expect(destroying.map((one) => `${one.method} ${one.template}`)).toEqual([
      'DELETE /api/cases/{caseId}',
    ])
  })

  /**
   * **Nothing that only reads may need more than read**, and nothing that
   * writes may be answered as a read. The direction that matters is the
   * second: a write derived as `read` is reachable by every analyst alive,
   * since the default customer's floor includes read.
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
   *
   * `recent-cases/{caseId}` is guarded and answers `write`, which is correct --
   * removing an entry from a personal list is not deleting a case. It is
   * correct because `indexOf` compares whole segments and `'recent-cases'` is
   * not `'cases'`, which is not a reason anybody chose.
   *
   * Nothing asserted it, so renaming that controller to `cases/recent` would
   * silently turn removing a list entry into a case deletion needing `delete`.
   * This is the assertion that fails when somebody does. -> #127
   */
  it('does not read a personal recent-list entry as the case itself', () => {
    const recents = published.filter((one) => one.template.includes('recent-cases'))
    expect(recents.length, 'the recent-cases routes have moved or gone').toBeGreaterThan(0)
    for (const { method, template } of recents) {
      expect(levelNeeded(method, template), `${method} ${template}`).not.toBe('delete')
    }
  })

  /**
   * **A method nobody has added yet is a write.** The specification does not
   * say this; the guard's own docstring does, and it is the safe direction --
   * *"guessing wrong should cost an analyst a refusal, never cost a customer a
   * write."* Asserted here because it is the property a future method inherits.
   */
  it.each(['PURGE', 'MOVE', 'LOCK', ''])('treats the unknown method %j as a write', (method) => {
    expect(levelNeeded(method, '/api/cases/{caseId}')).toBe('write')
  })
})
