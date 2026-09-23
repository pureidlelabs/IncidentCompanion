/**
 * Seeding writes the demonstration catalogue only on an unclaimed install
 * holding no demo case, each half of that asked on an install of its own.
 *
 * A scratch database, prepared by the schema step and `roles.sql`, because the
 * suite's own is claimed before any file runs (`global-setup.ts`).
 */
import { readFileSync } from 'node:fs'

import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client, type Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applySchema } from '../scripts/apply-schema.mjs'
import { createPool } from '../src/db/client.js'
import { cases, user } from '../src/db/schema/index.js'
import { DEMO_CASES } from '../src/demos/catalogue.js'
import { DemoContentSeeder } from '../src/demos/content.seeder.js'
import { DemoSeederService } from '../src/demos/seeder.service.js'
import { asRole, isEmbedded } from './database.js'

const ADMIN_URL = process.env.ADMIN_DATABASE_URL ?? ''
const APP_URL = process.env.DATABASE_URL ?? ''
const SCRATCH = 'ic_seed_once_test'
const scratch = (role?: string): string => {
  const url = new URL(`/${SCRATCH}`, ADMIN_URL).toString()
  return role ? asRole(url, role) : url
}

async function run(url: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

describe.skipIf(!ADMIN_URL || !APP_URL || isEmbedded(APP_URL))('seeding an install of its own', () => {
  let own: Pool
  let handle: ReturnType<typeof drizzle>
  let seeding: DemoSeederService
  const demos = async (): Promise<number> =>
    (await handle.select({ n: count() }).from(cases).where(eq(cases.isDemo, true)))[0]!.n

  beforeAll(async () => {
    const server = new URL('/postgres', ADMIN_URL).toString()
    await run(server, `drop database if exists ${SCRATCH} with (force)`)
    await run(server, `create database ${SCRATCH} owner ic_migrate`)
    await run(scratch(), readFileSync(new URL('../../docker/db/roles.sql', import.meta.url), 'utf8'))
    await applySchema(scratch('ic_migrate'))
    own = createPool(scratch('ic_seed'))
    handle = drizzle({ client: own })
    seeding = new DemoSeederService(handle, handle, new DemoContentSeeder())
  }, 120_000)

  afterAll(async () => {
    await own?.end()
    await run(new URL('/postgres', ADMIN_URL).toString(), `drop database if exists ${SCRATCH} with (force)`)
  })

  it('writes the catalogue on an unclaimed install, and nothing while its demo cases stand', async () => {
    expect(await seeding.seedOnce()).toBe(DEMO_CASES.length)
    expect(await seeding.seedOnce()).toBe(0)
    expect(await demos()).toBe(DEMO_CASES.length)
  })

  it('writes nothing on a claimed install whose analysts deleted every demo case', async () => {
    await handle.delete(cases).where(eq(cases.isDemo, true))
    const at = new Date()
    await handle
      .insert(user)
      .values({ id: 'claimed', name: 'Claimed', email: 'claimed@example.test', emailVerified: true, createdAt: at, updatedAt: at })
    expect(await seeding.seedOnce()).toBe(0)
    expect(await demos()).toBe(0)
  })
})
