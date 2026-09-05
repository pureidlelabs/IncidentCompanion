/**
 * **Every documented read serves what the reference says it serves.**
 *
 * The trick that makes this cheap: the serializer interceptor is already the
 * validator. A decorated route parses its own payload against the published
 * schema on the way out, so a read that answers 200 has *proved* the shape
 * matched, and one whose handler drifted answers 500 instead. This sweep
 * therefore needs no JSON-schema validator of its own - it needs only to make
 * the request and refuse a 500.
 *
 * **Reads only.** A write would have to invent a valid body per route and would
 * leave rows behind; pressing the writes is the browser tier's job
 * (`server/e2e/prodding.spec.ts`). What is asserted here is the half that can be
 * asserted without inventing anything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  operations,
  sharedAdmin,
  type Harness,
  type Operation,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

/**
 * Reads that cannot be swept blind, with the reason.
 *
 * **Not "routes that fail".** Each of these would need a fixture the sweep has
 * no business creating, and listing them is what stops the sweep quietly
 * covering less than its name claims.
 */
const NOT_SWEPT: ReadonlyArray<readonly [string, string]> = [
  ['/api/cases/{caseId}/{collection}.csv', 'Streams a file whose columns depend on the collection.'],
  ['/api/cases/{caseId}/evidence/{id}/file', 'Streams stored bytes that no fixture has written.'],
  ['/api/cases/{caseId}/report.md', 'Renders a report that no fixture has authored.'],
  ['/api/cases/{caseId}/report.pdf', 'As above, and paints a document.'],
  ['/api/cases/{caseId}/report.docx', 'As above.'],
  ['/api/appearance/{userId}/avatar', 'Streams an image nobody has uploaded.'],
]

const skipped = (one: Operation): string | undefined =>
  NOT_SWEPT.find(([path]) => path === one.template)?.[1]

describe.skipIf(!runnable)('what the documented reads actually serve', () => {
  let harness: Harness
  let admin: Persona
  let reads: Operation[]

  beforeAll(async () => {
    harness = await boot()
    // Promoted rather than assumed first: the suite shares one database, so
    // whichever sweep runs first would otherwise take the only admin.
    admin = await sharedAdmin(harness)
    reads = operations(harness.document).filter((one) => one.method === 'GET' && !skipped(one))
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('signs in as the install administrator', () => {
    expect(admin.role).toBe('admin')
  })

  it('has reads to sweep', () => {
    expect(reads.length).toBeGreaterThan(30)
  })

  /**
   * **A 500 here is the interceptor refusing the handler's own payload**, which
   * is exactly the drift between the document and the app that no unit test can
   * see: the declared type is honest and the runtime value is not.
   */
  it('serves no read that contradicts its published shape', async () => {
    const broken: string[] = []
    for (const one of reads) {
      const response = await fetch(`${harness.base}${one.path}`, {
        headers: { cookie: admin.cookie },
      })
      if (response.status >= 500) {
        broken.push(`GET ${one.template} -> ${response.status} ${(await response.text()).slice(0, 160)}`)
      }
    }
    expect(broken).toEqual([])
  }, 180_000)

  /**
   * Guards the sweep above from passing vacuously - and this is the assertion
   * that carries the "verified against the app" claim.
   *
   * **Only the reads that take no path parameter.** One that does is asked
   * about an id no fixture creates, so a 404 is the *correct* answer and
   * counting it proves nothing either way. A read with nothing to look up has
   * no such excuse: it reaches its handler, builds a real payload, and that
   * payload is parsed against the published schema on the way out. A 200 here
   * is the document and the app agreeing on real data.
   *
   * If authentication silently broke, every one of these would answer 401 and
   * this goes red - which is what stops the 500-sweep above passing on an empty
   * set of successful requests.
   */
  it('serves every read that has nothing to look up', async () => {
    const unparameterised = reads.filter((one) => !one.template.includes('{'))
    expect(unparameterised.length).toBeGreaterThan(10)

    const refused: string[] = []
    for (const one of unparameterised) {
      const response = await fetch(`${harness.base}${one.path}`, {
        headers: { cookie: admin.cookie },
      })
      if (response.status !== 200) {
        refused.push(`GET ${one.template} -> ${response.status}`)
      }
    }
    expect(refused).toEqual([])
  }, 180_000)

  it('has no unswept entry for a read that is gone', () => {
    const live = new Set(operations(harness.document).map((one) => one.template))
    expect(NOT_SWEPT.filter(([path]) => !live.has(path)).map(([path]) => path)).toEqual([])
  })
})
