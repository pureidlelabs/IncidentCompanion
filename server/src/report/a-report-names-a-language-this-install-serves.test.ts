import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { as } from '../../test/acting.js'

import { CollectionService } from '../collections/collection.service.js'
import { REPORTS_COLLECTION } from '../collections/definitions.js'
import { cases, reportLanguage, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'
import { suiteStore } from '../../test/evidence-on-disk.js'

/**
 * **The language a report is stored with is one this install can print it in.**
 *
 * **The fallback is not the defect and is left alone.** A pack removed after a
 * report chose it should still print; what is wrong is choosing one that never
 * existed.
 *
 * The three served codes are asserted here rather than left implied, because a
 * check reading the table alone refuses two of them. -> `language.service.ts`
 */
const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('the language a report is written with', () => {
  let collections: CollectionService
  let caseId: string
  let actorId: string
  const pack = `zz${String(Date.now()).slice(-4)}`

  beforeAll(async () => {
    const now = new Date()
    actorId = crypto.randomUUID()
    await seed!.insert(user).values({
      id: actorId,
      name: 'Language Analyst',
      email: `lang-${String(Date.now())}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })

    const [row] = await seed!
      .insert(cases)
      .values({ title: 'A case with a report', createdBy: actorId })
      .returning()
    caseId = row!.id

    await seed!.insert(reportLanguage).values({
      code: pack,
      label: 'A pack this install holds',
      strings: {},
      builtin: false,
    })

    collections = as(actorId, new CollectionService(db!, suiteStore()))
  })

  afterAll(async () => {
    await seed?.delete(reportLanguage).where(eq(reportLanguage.code, pack))
    await pool?.end()
    if (seedPool !== pool) await seedPool?.end()
  })

  const write = (language: string) =>
    collections.create(REPORTS_COLLECTION, caseId, { label: 'A report', language }, actorId)

  it('refuses a code no pack defines', async () => {
    await expect(write('qq-not-a-pack')).rejects.toThrow()
  })

  it('takes a code a pack does define', async () => {
    await expect(write(pack)).resolves.toBeDefined()
  })

  it('takes English, which is served and is never a row', async () => {
    await expect(write('en')).resolves.toBeDefined()
  })

  it('takes a report that has not chosen one', async () => {
    await expect(write('')).resolves.toBeDefined()
  })
})
