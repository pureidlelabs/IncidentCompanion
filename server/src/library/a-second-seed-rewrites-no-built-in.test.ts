/**
 * Seeding an install that already holds the built-ins writes none of them, and
 * a built-in whose stored content differs from what ships is written back.
 *
 * Read by row version (`xmin`), which moves on any write, including one that
 * stores the same values.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LibraryService } from './library.service.js'
import { library } from '../db/schema/library.js'
import { reportLanguage } from '../db/schema/language.js'
import { LanguageService } from '../report/language.service.js'
import { openTestPool } from '../../test/database.js'

const APP_URL = process.env.DATABASE_URL ?? ''
const SEED_URL = process.env.SEED_DATABASE_URL ?? ''
const appPool = APP_URL ? openTestPool(APP_URL, 'ic_app') : null
const seedPool = SEED_URL ? openTestPool(SEED_URL, 'ic_seed') : null
const db = appPool ? drizzle({ client: appPool }) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

async function versions(): Promise<Record<string, string>> {
  const built = await seed!
    .select({ key: sql<string>`${library.kind} || '/' || ${library.name}`, version: sql<string>`xmin::text` })
    .from(library)
    .where(eq(library.builtin, true))
  const packs = await seed!
    .select({ key: sql<string>`'language/' || ${reportLanguage.code}`, version: sql<string>`xmin::text` })
    .from(reportLanguage)
    .where(eq(reportLanguage.builtin, true))
  return Object.fromEntries([...built, ...packs].map(({ key, version }) => [key, version]))
}

describe.skipIf(!db || !seed)('seeding the built-ins again', () => {
  let books: LibraryService
  let languages: LanguageService

  beforeAll(async () => {
    books = new LibraryService(db!, seed)
    languages = new LanguageService(db!, seed)
    await books.seedBuiltIns()
    await languages.seedBuiltIn()
  }, 90_000)

  afterAll(async () => {
    await Promise.all([appPool!.end(), seedPool!.end()])
  })

  it('writes no built-in whose content has not changed', async () => {
    const before = await versions()
    expect(Object.keys(before).length, 'nothing is seeded, so nothing here can be rewritten').toBeGreaterThan(1)
    await books.seedBuiltIns()
    await languages.seedBuiltIn()
    expect(await versions()).toEqual(before)
  })

  it('writes back a built-in whose stored content differs from what ships, and only that one', async () => {
    const [one] = await seed!.select({ id: library.id }).from(library).where(eq(library.builtin, true)).limit(1)
    const [drifted] = await seed!
      .update(library)
      .set({ label: 'an older label' })
      .where(eq(library.id, one!.id))
      .returning({ kind: library.kind, name: library.name })
    const before = await versions()

    await books.seedBuiltIns()

    const after = await versions()
    const key = `${drifted!.kind}/${drifted!.name}`
    expect(after[key], 'the drifted built-in was not written back').not.toBe(before[key])
    const [restored] = await seed!
      .select({ label: library.label })
      .from(library)
      .where(sql`${library.kind} = ${drifted!.kind} and ${library.name} = ${drifted!.name}`)
    expect(restored!.label).not.toBe('an older label')
    delete before[key]
    delete after[key]
    expect(after).toEqual(before)
  })
})
