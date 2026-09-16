/**
 * **A query parameter the document calls required is one the route refuses to
 * work without.**
 *
 * The write sweep next door checks that a body the reference calls valid is
 * accepted. This is the same question asked of the other half of a request:
 * `@nestjs/swagger` marks every `@Query()` parameter required unless it is told
 * otherwise, and nothing told it -- so `?` in the handler's signature and
 * `required` in the document said opposite things, with no tier reading both.
 *
 * **Asserted by omitting it, in both directions.** A parameter that is
 * genuinely required produces a refusal when it is left out; one that is not
 * answers as though nothing was missing. Each is its own way of lying, and the
 * second is the one that leaves a generated client unable to call the route.
 * Reading the handler's signature instead would test the generator against the
 * same metadata the generator used.
 *
 * **GET alone**, because a write left out of this sweep is a write performed:
 * the point of a request here is the answer's status, and the reads are where
 * that can be asked without changing the install.
 *
 * **What this does not cover:** whether a parameter that is *not* published
 * exists -- an undocumented parameter is a description that is short rather
 * than untrue, and nothing in a document can point at one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, operations, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

interface Parameter {
  name: string
  in: string
  required?: boolean
  schema?: { default?: unknown }
}

describe.skipIf(!runnable)('a query parameter the document calls required', () => {
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

  it('is the only kind the route will not answer without', async () => {
    const doc = harness.document as unknown as Record<string, unknown>
    const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>
    const lied: string[] = []
    let asked = 0

    for (const one of operations(harness.document)) {
      if (one.method !== 'GET') continue

      const operation = paths[one.template]?.[one.method.toLowerCase()] as
        | { parameters?: Parameter[] }
        | undefined
      const query = (operation?.parameters ?? []).filter((parameter) => parameter.in === 'query')
      if (query.length === 0) continue

      const demanded = query.filter((parameter) => parameter.required === true)
      const path = one.path.replace('00000000-0000-4000-8000-000000000000', realCase)
      const response = await fetch(`${harness.base}${path}`, {
        headers: { cookie: admin.cookie },
      })
      asked++

      /**
       * **Asked in both directions, because each is a way of lying.**
       *
       * A parameter the document demands and the route serves happily without
       * makes a caller send something nothing wanted; one the document calls
       * optional and the route refuses to work without leaves a generated
       * client unable to call the route at all.
       *
       * **A refusal that is not about the parameter is fine.** A stand-in id
       * names no row, so a 404 or a 403 is about the row rather than the
       * query. Only a 400 says *you did not send what I need*, and only a 200
       * says *I did not need it*.
       */
      if (demanded.length > 0 && response.status === 200) {
        lied.push(`GET ${one.template} -> 200 without ${demanded.map((p) => p.name).join(', ')}`)
      }
      if (demanded.length === 0 && response.status === 400) {
        lied.push(`GET ${one.template} -> 400 with every parameter it calls optional left out`)
      }
    }

    expect(lied).toEqual([])
    // Guards against a sweep that walked a document with no query parameter on
    // any read, which would leave this passing over nothing.
    expect(asked).toBeGreaterThan(5)
  }, 180_000)

  /**
   * **The parameter that decides the media type is published.** The indicators
   * export serves CSV by default and a STIX bundle on `?format=stix`; the
   * document listed neither the parameter nor the second content type, so a
   * caller reading it cannot reach the bundle at all -- and `tlp`, the one
   * parameter it *was* told to send, is refused unless the format it does not
   * know about is the one asked for.
   */
  it('names the parameter that changes what the indicators export answers with', () => {
    const paths = (harness.document as unknown as {
      paths: Record<string, Record<string, { parameters?: Parameter[]; responses?: Record<string, { content?: Record<string, unknown> }> }>>
    }).paths
    const operation = paths['/api/cases/{caseId}/indicators']?.['get']
    const named = (operation?.parameters ?? []).map((one) => one.name)

    expect(named).toContain('format')
    expect(Object.keys(operation?.responses?.['200']?.content ?? {}).sort()).toEqual([
      'application/json',
      'text/csv',
    ])
  })
})
