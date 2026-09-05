/**
 * A row submitted past the screen meets the same standard, and the refusal
 * names the field.
 *
 * *That check MUST happen where the caller cannot influence it. A screen
 * checking before it submits is a convenience for the analyst; it is not the
 * check, and a caller that is not that screen must meet the same standard. A
 * refusal MUST name the field and what was wrong with it.*
 *
 * **Driven over HTTP, because that is where a caller that is not the screen
 * arrives.** A test calling `CollectionService` directly would skip the pipe
 * that does the checking and prove the opposite of what it set out to.
 *
 * **Naming the field is the half worth asserting.** A 422 alone is satisfied by
 * a handler that refuses everything, and the requirement is explicit that the
 * refusal says which field and what was wrong with it -- a caller writing an
 * import against this API otherwise has to guess.
 *
 * Three shapes rather than one: a value outside a vocabulary, a required field
 * missing, and a field of the wrong type. They fail at different points in a
 * Zod schema, and a refusal that named the field for one and not the others
 * would pass a single-case test.
 *
 * **The status is deliberately not pinned, because this route answers the wrong
 * one.** `malformed-requests.test.ts` asserts the line, citing RFC 9110: a body
 * the server cannot parse is 400, and one it parsed and will not act on is 422.
 * These rows are valid JSON the schema refuses, so they are the second kind and
 * answer 400. Asserting 400 here would pin that as correct; asserting 422 would
 * redden a suite over a defect this file is not fixing. So what is asserted is
 * that the row is refused and the field is named, which is what the scenario
 * asks, and the status is filed. -> #241
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { openTestPool } from './database.js'

/** A bad row, the field it is bad in, and why it is bad. */
const REFUSABLE = [
  {
    what: 'a value outside the vocabulary',
    field: 'kind',
    row: { kind: 'nonsense', time: '2026-05-01T10:00:00.000Z', description: 'Something' },
  },
  {
    what: 'a required field left out',
    field: 'description',
    row: { kind: 'event', time: '2026-05-01T10:00:00.000Z' },
  },
  {
    what: 'a field of the wrong type',
    field: 'description',
    row: { kind: 'event', time: '2026-05-01T10:00:00.000Z', description: 42 },
  },
] as const

let harness: Harness | null = null
let admin: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let caseId = ''

describe.skipIf(!(await bootable()))('a row a caller submits directly', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')

    const [made] = await drizzle({ client: pool })
      .insert(cases)
      .values({ title: 'A case rows are submitted to' })
      .returning({ id: cases.id })
    caseId = made!.id
  }, 90_000)

  afterAll(async () => {
    if (pool && caseId !== '') {
      await drizzle({ client: pool }).delete(cases).where(eq(cases.id, caseId))
    }
    await pool?.end()
    await harness?.close()
  })

  it('takes a row the screen would have sent, so the refusals below are the row', async () => {
    const answer = await fetch(`${harness!.base}/api/cases/${caseId}/timeline`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'event',
        time: '2026-05-01T09:00:00.000Z',
        description: 'A row that is fine',
      }),
    })
    expect(answer.status, `a valid row was refused: ${await answer.text()}`).toBe(201)
  })

  it.each(REFUSABLE.map((one) => [one.what, one] as const))(
    'refuses %s, and names the field',
    async (_what, bad) => {
      const answer = await fetch(`${harness!.base}/api/cases/${caseId}/timeline`, {
        method: 'POST',
        headers: { cookie: admin.cookie, 'content-type': 'application/json' },
        body: JSON.stringify(bad.row),
      })
      const body = await answer.text()

      expect(
        answer.status,
        `the row was accepted: ${body}`,
      ).toBeGreaterThanOrEqual(400)
      expect(answer.status, `the row failed rather than being refused: ${body}`).toBeLessThan(500)
      expect(
        body,
        `the refusal does not name ${bad.field}, so a caller is told the row is wrong and ` +
          'not which part of it',
      ).toContain(bad.field)
    },
  )
})
