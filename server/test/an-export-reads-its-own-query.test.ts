/**
 * **The query the export schemas describe is the query the routes refuse by.**
 *
 * `?format`, `?tlp` and `?onDuplicate` were read and validated by hand inside
 * the handlers, and asserted by tests that call those handlers positionally --
 * which is the one thing such a test cannot see. A route binding `fmt` while
 * the client sends `?format=` serves CSV for `?format=stix` and every direct
 * call stays green; that has happened here before, and the comment recording it
 * sits on the route.
 *
 * The schema that publishes each parameter is now the schema that refuses a bad
 * one, so the refusal happens in the validation pipe rather than in the body --
 * **before the handler is entered at all**, which is exactly where a direct call
 * cannot reach. These cases are the ones that moved, asked over HTTP.
 *
 * **The accepted values are asserted beside the refused ones.** A schema that
 * refused everything would satisfy every refusal case here, and the sweep in
 * `a-required-parameter-is-required.test.ts` only ever omits a parameter.
 *
 * -> #813
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('an export reading its own query', () => {
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

  const indicators = (query: string) =>
    fetch(`${harness.base}/api/cases/${realCase}/indicators${query}`, {
      headers: { cookie: admin.cookie },
    })

  it('serves the inventory as CSV when nothing is asked for', async () => {
    const answered = await indicators('')

    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toMatch(/^text\/csv/)
  }, 30_000)

  /**
   * **The wire's name, not the handler's.** A route binding an internal `fmt`
   * serves CSV for `?format=stix` and every direct call stays green; the check
   * that used to hold this read the route's argument metadata, which a query
   * bound whole no longer carries. Asking over HTTP holds the same claim
   * against the thing a caller actually does.
   */
  it('serves the actionable subset as a bundle on the format the document names', async () => {
    const answered = await indicators('?format=stix')

    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toMatch(/^application\/json/)
    expect(((await answered.json()) as { type?: string }).type).toBe('bundle')
  }, 30_000)

  it('carries the marking the caller asked for, on the format that can', async () => {
    // The parameter the document called required and the route refused: sent
    // as the document now describes it, it is served.
    const answered = await indicators('?format=stix&tlp=amber')

    expect(answered.status).toBe(200)
    expect(JSON.stringify(await answered.json())).toContain('amber')
  }, 30_000)

  it.each([
    ['a format nobody defined', '?format=xlsx'],
    ['a marking nobody defined', '?format=stix&tlp=taupe'],
  ])('refuses %s', async (_name, query) => {
    const answered = await indicators(query)

    expect(answered.status).toBe(422)
  }, 30_000)

  /**
   * The one rule left in the handler: it holds between two fields, so no schema
   * states it and the refusal has to name which format was asked for.
   */
  it('refuses a marking on a format that cannot carry one', async () => {
    const answered = await indicators('?tlp=amber')

    expect(answered.status).toBe(422)
    expect(await answered.text()).toContain('carries no TLP')
  }, 30_000)

  /**
   * **Reading `?onDuplicate=replaces` as `skip` answers a question the analyst
   * thought they had settled**, and the file then imports having done the
   * opposite of what was asked. The empty string is what `?onDuplicate=`
   * arrives as; the wrong case is what somebody writing the query by hand
   * sends.
   */
  it.each(['replaces', 'REPLACE', 'merge', ''])(
    'refuses an import instruction spelled %o rather than reading it as skip',
    async (instruction) => {
      const answered = await fetch(
        `${harness.base}/api/cases/${realCase}/systems.csv?onDuplicate=${instruction}`,
        {
          method: 'POST',
          headers: { cookie: admin.cookie, 'content-type': 'text/csv' },
          body: 'hostname\nWKS-NEVER-WRITTEN\n',
        },
      )

      expect(answered.status).toBe(422)
    },
    30_000,
  )
})
