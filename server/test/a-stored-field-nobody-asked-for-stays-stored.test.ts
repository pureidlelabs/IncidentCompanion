/**
 * A column the response schema does not name cannot reach a caller.
 *
 * *Adding a field to a stored thing MUST NOT enlarge every response that
 * mentions it.* `CasesService.list` is `db.select().from(cases)` -- every
 * column, unprojected -- so nothing between the table and the wire narrows the
 * row except `ZodSerializerInterceptor` parsing it through the schema the route
 * declares. That interceptor is the whole of the protection, and it is one
 * provider line away from not being there.
 *
 * **Neither case here detects the interceptor being gone, and that was
 * measured rather than assumed.** Commenting out its provider line left all
 * three green: no route offers a surplus key today, so with or without the
 * parse the served row is identical. What is asserted is therefore narrower
 * than the requirement -- that the response is the schema's shape, and that
 * the schema drops what it does not name. The step joining them is the
 * provider line, and nothing here holds it.
 *
 * **The surplus key is added to a row the server really served**, rather than
 * to a hand-built fixture. Every field of `caseReadSchema` is required, so a
 * fixture would be twenty-seven guesses at what the schema wants and would
 * fail on the schema changing rather than on the behaviour changing.
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
   *
   * This fails the day the table gains a column the schema does not name --
   * which is the direction the requirement is about -- and it fails whether the
   * cause is a missing parse or a widened select.
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

  /**
   * And the parse removes what it does not name.
   *
   * This is what makes a new column safe: `list` selects every column, so the
   * day one is added it arrives here, and this is the step that drops it.
   */
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
