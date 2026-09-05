/**
 * A column the response schema does not name cannot reach a caller.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { caseReadSchema } from '../src/domain/case.js'
import {
  boot,
  bootable,
  seedDemoContent,
  sharedAdmin,
  type Harness,
  type Persona,
} from './app-harness.js'

/** A name no column has, so its survival can only be passthrough. */
const UNNAMED = 'aColumnAddedAfterThisWasWritten'

let harness: Harness | null = null
let admin: Persona
let served: Record<string, unknown> | undefined

describe.skipIf(!(await bootable()))('a case as the list serves it', () => {
  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)

    const response = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: admin.cookie },
    })
    const rows = (await response.json()) as Record<string, unknown>[]
    served = rows[0]
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('was served a case to inspect', () => {
    expect(served, 'no case came back, so both cases below assert nothing').toBeDefined()
    expect(Object.keys(served!).length).toBeGreaterThan(5)
  })

  /**
   * Asserted against the schema rather than a written list: the claim is that
   * the response is the schema's shape, and writing that shape out here would
   * be the same constant twice.
   */
  it('carries the fields the response schema names, and no others', () => {
    const shape = new Set(Object.keys(caseReadSchema.shape))
    expect(shape.size).toBeGreaterThan(5)

    const extra = Object.keys(served!).filter((one) => !shape.has(one)).sort()
    expect(
      extra,
      'the response carries fields its own schema does not name, so something reaches the ' +
        'wire without passing the parse that would strip a new column',
    ).toEqual([])
  })

  it('drops a field the schema does not name', () => {
    const parsed = caseReadSchema.parse({ ...served, [UNNAMED]: 'leaked' }) as Record<
      string,
      unknown
    >

    expect(
      Object.keys(parsed),
      'a key the schema never named survived the parse, so a column added to the table ' +
        'would enlarge this response for every caller',
    ).not.toContain(UNNAMED)
  })
})
