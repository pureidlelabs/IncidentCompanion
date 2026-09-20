/**
 * **Every documented read serves a body its own published schema accepts.**
 *
 * `served-shapes.test.ts` asks a different question and says so: the serializer
 * refuses a payload the *Zod* schema rejects, so a 200 proves the handler and
 * the schema agree. It cannot see the step after that. The document is
 * generated from those schemas, and a generator that renders one of them
 * wrongly produces a reference that is honest about nothing -- with the route
 * still answering 200 and every suite still green.
 *
 * So this validates the response against the **document**, which is what a
 * client writes against, rather than against the schema the document came from.
 *
 * **Reads only, and the same exclusions.** A write would have to invent a body
 * per route and would leave rows behind. -> #862
 *
 * **What this does not cover:** a status that is wrong for the request, a
 * refusal carrying the wrong media type, and a required parameter that is not
 * required. Each is its own axis and each has its own sweep today; #862 is the
 * issue that wants them in one place.
 */
import Ajv2020 from 'ajv/dist/2020'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, operations, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/**
 * Reads whose body no fixture can make meaningful, with the reason.
 *
 * The same list `served-shapes.test.ts` keeps, for the same reason: a stream of
 * stored bytes or a painted document is not JSON and has no schema to check.
 */
const NOT_JSON: ReadonlyArray<readonly [string, string]> = [
  ['/api/cases/{caseId}/{collection}.csv', 'Streams a file rather than JSON.'],
  ['/api/cases/{caseId}/evidence/{id}/file', 'Streams stored bytes.'],
  ['/api/cases/{caseId}/report.md', 'Renders text.'],
  ['/api/cases/{caseId}/report.pdf', 'Paints a document.'],
  ['/api/cases/{caseId}/report.docx', 'As above.'],
  ['/api/appearance/{userId}/avatar', 'Streams an image.'],
]

/** A JSON pointer segment, with `~` and `/` escaped as RFC 6901 asks. */
const segment = (raw: string): string => raw.replace(/~/g, '~0').replace(/\//g, '~1')

describe.skipIf(!runnable)('the document describes what is served', () => {
  let harness: Harness
  let admin: Persona
  let ajv: Ajv2020

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)

    /**
     * **The whole document is registered, and every schema is reached through
     * a pointer into it.** Compiling a response schema on its own loses the
     * base it resolves `$ref` against, so a schema naming a component would
     * fail to compile rather than fail to match.
     *
     * `strict: false` because an OpenAPI schema carries keywords JSON Schema
     * does not define -- `example` and `discriminator` among them -- and
     * refusing those would refuse the document rather than the payload.
     */
    ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false })
    ajv.addSchema(harness.document, 'openapi.json')
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('has reads to check', () => {
    const reads = operations(harness.document).filter((one) => one.method === 'GET')
    expect(reads.length).toBeGreaterThan(30)
  })

  it('serves no read whose body its own schema refuses', async () => {
    const excluded = new Set(NOT_JSON.map(([path]) => path))
    const reads = operations(harness.document).filter(
      (one) => one.method === 'GET' && !excluded.has(one.template),
    )

    const wrong: string[] = []
    let checked = 0

    for (const one of reads) {
      const response = await fetch(`${harness.base}${one.path}`, {
        headers: { cookie: admin.cookie },
      })
      // A read of an id no fixture creates answers 404, correctly, and has no
      // body to judge.
      if (response.status !== 200) continue
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) continue

      const pointer = `/paths/${segment(one.template)}/get/responses/200/content/${segment('application/json')}/schema`
      const validate = ajv.getSchema(`openapi.json#${pointer}`)
      if (!validate) {
        wrong.push(`GET ${one.template} -> the document declares no 200 JSON schema`)
        continue
      }

      checked += 1
      if (!validate(await response.json())) {
        const said = (validate.errors ?? [])
          .slice(0, 3)
          .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`)
          .join('; ')
        wrong.push(`GET ${one.template} -> ${said}`)
      }
    }

    // The guard against a vacuous pass: a sweep that validated nothing because
    // every read answered 401 would otherwise report an empty list.
    expect(checked, 'no read produced a body to judge').toBeGreaterThan(10)
    expect(wrong.sort()).toEqual([])
  }, 180_000)

  it('has no exclusion for a read that is gone', () => {
    const live = new Set(operations(harness.document).map((one) => one.template))
    expect(NOT_JSON.filter(([path]) => !live.has(path)).map(([path]) => path)).toEqual([])
  })
})
