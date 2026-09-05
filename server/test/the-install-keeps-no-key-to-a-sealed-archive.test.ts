/**
 * An archive an analyst sealed is sealed against this install too: the secret
 * reaches nothing that survives the request.
 *
 * **What this does not cover:** what the process held in memory while it ran,
 * and anything written outside the database -- a log line, a core dump, a
 * temporary file. The passphrase is a request field either way; this asserts
 * only that it reaches no durable row.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { openTestPool } from './database.js'

/** Long enough to pass the floor, and unlike anything else in the store. */
const SECRET = 'seal-me-shut-9f2c41ab-never-stored'

/** The same secret, deliberately stored and then removed, to prove the scan finds it. */
const PLANTED = 'a case whose title is ' + SECRET

let harness: Harness | null = null
let admin: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let caseId = ''

/** Every column the store has that can hold text, from its own catalogue. */
const textColumns = async (db: ReturnType<typeof drizzle>) => {
  const found = await db.execute<{ table_name: string; column_name: string }>(sql`
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
  `)
  return found.rows
}

const hitsFor = async (db: ReturnType<typeof drizzle>, needle: string) => {
  const found: string[] = []
  for (const column of await textColumns(db)) {
    const where = sql.raw(
      `select 1 from public."${column.table_name}" where "${column.column_name}"::text like '%${needle}%' limit 1`,
    )
    const answer = await db.execute(where)
    if (answer.rows.length > 0) found.push(`${column.table_name}.${column.column_name}`)
  }
  return found
}

describe.skipIf(!(await bootable()))('an archive an analyst sealed', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')

    const [made] = await drizzle({ client: pool })
      .insert(cases)
      .values({ title: 'A case sealed into an archive' })
      .returning({ id: cases.id })
    caseId = made!.id

    const answer = await fetch(`${harness.base}/api/cases/${caseId}/archive`, {
      method: 'POST',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: SECRET, includeFiles: false }),
    })
    const sealed = Buffer.from(await answer.arrayBuffer())
    expect(answer.status, 'the archive was not produced').toBe(200)
    expect(
      sealed.subarray(0, 21).toString('utf8'),
      'the archive came back unsealed, so no secret was ever handed to the install',
    ).toBe('age-encryption.org/v1')
  }, 120_000)

  afterAll(async () => {
    if (pool && caseId !== '') {
      await drizzle({ client: pool }).delete(cases).where(eq(cases.id, caseId))
    }
    await pool?.end()
    await harness?.close()
  })

  it('would find this secret if a row held it, so the absence below is one', async () => {
    const db = drizzle({ client: pool! })

    expect(
      (await textColumns(db)).length,
      'the catalogue named no text column, so the scan looks at nothing',
    ).toBeGreaterThan(0)

    const [planted] = await db.insert(cases).values({ title: PLANTED }).returning({ id: cases.id })
    try {
      expect(
        await hitsFor(db, SECRET),
        'the scan cannot find this exact secret in a row that holds it, so finding it nowhere ' +
          'says nothing about whether the install kept one',
      ).not.toEqual([])
    } finally {
      await db.delete(cases).where(eq(cases.id, planted!.id))
    }
  })

  it('leaves its secret in no column this install holds', async () => {
    expect(
      await hitsFor(drizzle({ client: pool! }), SECRET),
      'the passphrase is stored, so the archive is sealed against everybody except whoever ' +
        'can read this install -- which is the one party the seal exists to exclude',
    ).toEqual([])
  })
})
