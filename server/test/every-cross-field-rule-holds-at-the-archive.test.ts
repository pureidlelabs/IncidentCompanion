/**
 * Every rule a collection declares across its fields refuses an archived row
 * as the collection's own door refuses it, a rule added later included.
 *
 * The gated fields are read from the schemas, so a new one needs a sample row
 * here before this passes, and cannot reach the archive door unchecked.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray } from 'drizzle-orm'
import type { z } from 'zod'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases } from '../src/db/schema/case.js'
import { CASE_NAME, pack } from '../src/archive/format.js'
import { COLLECTION_SCHEMAS } from '../src/domain/collections.js'
import { fields, hasCrossFieldRule } from '../src/domain/field-spec.js'
import { TABLES } from '../src/case-archive/import.service.js'
import { baseOf } from '../src/case-archive/rows.js'

const STAMP = String(Date.now())

/** A row each collection's door accepts, with its gate's field holding a value outside the gate. */
const SAMPLES: Record<string, { row: Record<string, unknown>; setting: Record<string, unknown> }> = {
  network_indicators: { row: { type: 'domain', value: `gated-${STAMP}.example` }, setting: { scope: 'site-a' } },
}

/** Every collection and field a gate governs, read from the schemas. */
const gated = Object.entries(COLLECTION_SCHEMAS).flatMap(([collection, schema]) =>
  hasCrossFieldRule(schema)
    ? Object.entries(schema.shape).flatMap(([field, sub]) =>
        fields.get(sub as z.ZodType)?.applicableWhen ? [{ collection, field }] : [],
      )
    : [],
)

/** The case record's key for a collection, as the archive names it. */
const recordKey = (collection: string) =>
  TABLES.map(([key]) => key).find((key) => baseOf(key, {}) === COLLECTION_SCHEMAS[collection])

describe.skipIf(!(await bootable()))('a rule spanning fields, at the archive door', () => {
  let harness: Harness
  let analyst: Persona
  const pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
  const seed = drizzle({ client: pool })

  async function call(method: string, path: string, body: unknown, type = 'application/json') {
    return fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: analyst.cookie, 'content-type': type, origin: harness.origin },
      body: type === 'application/json' ? JSON.stringify(body) : (body as BodyInit),
    })
  }

  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
  }, 120_000)

  afterAll(async () => {
    const left = await seed.select({ id: cases.id }).from(cases).where(eq(cases.title, `Gated ${STAMP}`))
    if (left.length > 0) await seed.delete(cases).where(inArray(cases.id, left.map((one) => one.id)))
    await pool.end()
    await harness?.close()
  })

  it('finds a rule to hold', () => {
    expect(gated.length).toBeGreaterThan(0)
  })

  // The control: each sample reads in without its gated value, so a refusal below is the rule's.
  it.each(Object.entries(SAMPLES))('reads a %s sample row in when its gated field is empty', async (collection, sample) => {
    const archive = await pack(
      {
        [CASE_NAME]: new TextEncoder().encode(
          JSON.stringify({ title: `Gated ${STAMP}`, [recordKey(collection)!]: [{ id: `ok-${STAMP}`, ...sample.row }] }),
        ),
      },
      'omitted',
    )
    const answer = await call('POST', '/api/cases/import', new Uint8Array(archive), 'application/octet-stream')

    expect(answer.status, await answer.text()).toBe(201)
  })

  it.each(gated)('refuses $field set in $collection where its gate says it does not apply', async ({ collection, field }) => {
    const sample = SAMPLES[collection]
    expect(sample, `no sample row for ${collection}: add one to SAMPLES`).toBeDefined()
    expect(sample!.setting[field], `no value for ${collection}.${field}: add one to SAMPLES`).toBeDefined()
    const key = recordKey(collection)
    expect(key, `no archive key for ${collection}`).toBeDefined()

    const row = { id: `row-${STAMP}`, ...sample!.row, [field]: sample!.setting[field] }
    const archive = await pack(
      { [CASE_NAME]: new TextEncoder().encode(JSON.stringify({ title: `Gated ${STAMP}`, [key!]: [row] })) },
      'omitted',
    )
    const answer = await call('POST', '/api/cases/import', new Uint8Array(archive), 'application/octet-stream')
    const body = (await answer.json()) as { message?: string }

    expect({ status: answer.status, names: body.message?.includes(key!) }).toEqual({ status: 422, names: true })
  })
})
