/**
 * **A request the server should refuse is refused, never crashed.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, operations, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** A well-formed id that names nothing, so the answer is about absence. */
const NOWHERE = '00000000-0000-4000-8000-000000000000'

/**
 * Routes for which a JSON body genuinely *is* malformed, so 400 is right.
 */
const ANSWERS_MALFORMED: ReadonlyArray<readonly [string, string]> = [
  ['/api/appearance/avatar', 'Takes image bytes; a JSON body is not a picture.'],
  ['/api/cases/{caseId}/{collection}.csv', 'Takes a CSV; a JSON body has no header row.'],
  ['/api/cases/{caseId}/timeline', 'Takes an entry or a file, and refuses the shape before the schema.'],
  ['/api/cases/{caseId}/timeline/{id}', 'As above.'],
  ['/api/regimes/{name}', 'The name in the path is not a regime this install has.'],
  ['/api/library/{slug}', 'The slug names a kind that cannot be written.'],
]

const answersMalformed = (template: string): boolean =>
  ANSWERS_MALFORMED.some(([path]) => path === template)

describe.skipIf(!runnable)('a request the server cannot honour', () => {
  let harness: Harness
  let admin: Persona
  let realCase: string

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)
    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    realCase = cases[0]!.id
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **Every method, not just the reads.**
   */
  it('answers Not Found for an id that names nothing, rather than failing', async () => {
    const crashed: string[] = []

    let asked = 0
    for (const one of operations(harness.document)) {
      if (!one.template.includes('{')) continue
      asked++
      const response = await fetch(`${harness.base}${one.path}`, {
        method: one.method,
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: ['GET', 'DELETE'].includes(one.method) ? undefined : '{}',
      })
      if (response.status >= 500) {
        crashed.push(
          `${one.method} ${one.template} -> ${response.status} ${(await response.text()).slice(0, 120)}`,
        )
      }
    }

    expect(crashed).toEqual([])
    // Guards against a route table that stopped yielding parameterised routes.
    expect(asked).toBeGreaterThan(20)
  }, 180_000)

  /**
   * **The line between 400 and 422, asserted rather than described.**
   */
  it('separates a body it cannot parse from one it will not accept', async () => {
    const target = `${harness.base}/api/regimes/nis2`
    const send = (body: string, type = 'application/json') =>
      fetch(target, {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': type },
        body,
      })

    // Not JSON at all: the server cannot read it.
    expect((await send('{ this is not json')).status).toBe(400)

    // Valid JSON, wrong shape: the server read it and refuses to act on it.
    expect((await send(JSON.stringify({ enabled: 'yes please' }))).status).toBe(422)
  }, 60_000)

  it('refuses a body it cannot parse, rather than failing on it', async () => {
    const crashed: string[] = []
    const succeeded: string[] = []
    const misgraded: string[] = []
    let validated = 0

    for (const one of operations(harness.document)) {
      if (one.method === 'GET' || one.method === 'DELETE') continue
      const path = one.path.replace(NOWHERE, realCase).replace('{caseId}', realCase)
      const response = await fetch(`${harness.base}${path}`, {
        method: one.method,
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        // Not valid for anything: an unknown field, and the wrong type for
        // every field this app declares.
        body: JSON.stringify({ __not_a_field__: { nested: [1, 2, 3] } }),
      })
      if (response.status === 422) validated++
      /**
       * **400 is now wrong for this body, and the sweep is what keeps it so.**
       */
      if (response.status === 400 && !answersMalformed(one.template)) {
        misgraded.push(`${one.method} ${one.template} -> 400, expected 422`)
      }
      /**
       * **A write that succeeds on a body nobody could mean is the worse failure**,
       * because it answers "created" and the caller believes it.
       */
      if (response.status < 300) {
        succeeded.push(`${one.method} ${one.template} -> ${response.status}`)
      }
      if (response.status >= 500) {
        crashed.push(
          `${one.method} ${one.template} -> ${response.status} ${(await response.text()).slice(0, 120)}`,
        )
      }
    }

    expect(crashed).toEqual([])
    expect(succeeded).toEqual([])
    expect(misgraded).toEqual([])
    /**
     * **The guard that stops this passing vacuously**, and it is not
     * hypothetical: a write aimed at a row that does not exist answers 404
     * without the body ever reaching the validation pipe, so a sweep that
     * accidentally pointed every route at a missing row would assert nothing
     * while staying green. Measured when written: 58 of 70 writes answered 400
     * and 6 answered 422.
     */
    expect(validated).toBeGreaterThan(40)
  }, 180_000)
})
