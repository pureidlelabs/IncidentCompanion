/**
 * **Every documented read serves what the reference says it serves.**
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
