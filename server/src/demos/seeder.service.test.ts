/**
 * What a demo reset must and must not touch.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { DemoContentSeeder } from './content.seeder.js'
import { DemoSeederService } from './seeder.service.js'
import { DEMO_CASES } from './catalogue.js'
import { cases } from '../db/schema/index.js'
import { caseCompliance } from '../db/schema/case-compliance.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null
// **The seeding role, matching how Nest wires it.** Generating demos writes
// rows into every case and deletes all of them, which the request-serving role
// is refused. Built on `db` this suite would fail on the first insert.
const seeder = seed ? new DemoSeederService(seed, seed, new DemoContentSeeder(seed)) : null

describe.skipIf(!db)('rebuilding the demo cases', () => {
  beforeEach(async () => {
    await seed!.delete(cases)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  it('creates one case per demo', async () => {
    const count = await seeder!.reseed()
    expect(count).toBe(DEMO_CASES.length)

    const rows = await seed!.select().from(cases).where(eq(cases.isDemo, true))
    expect(rows.map((r) => r.reference).sort()).toEqual(
      DEMO_CASES.map((d) => d.reference).sort(),
    )
  })

  it('writes the regulatory record, which no demo used to carry', async () => {
    await seeder!.reseed()

    const [breach] = await seed!
      .select()
      .from(cases)
      .where(eq(cases.reference, 'DEMO-2026-047'))
    const [record] = await seed!
      .select()
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, breach!.id))

    expect(record?.gdprAwareAt).toBeInstanceOf(Date)
    expect(record?.usersAffectedCount).toBe(6_200_000)
    // Nobody has filed: the state the clock strip exists to make loud.
    expect(record?.gdprAuthorityNotifiedAt).toBeNull()
  })

  it('puts awareness far enough back that the Article 33 clock has run out', async () => {
    // The reading this demo exists for, and the one no case could reach while
    // every demo began at the instant it was seeded.
    await seeder!.reseed()

    const [breach] = await seed!
      .select()
      .from(cases)
      .where(eq(cases.reference, 'DEMO-2026-047'))
    const [record] = await seed!
      .select()
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, breach!.id))

    const hours = (Date.now() - record!.gdprAwareAt!.getTime()) / 3_600_000
    expect(hours).toBeGreaterThan(72)
  })

  it('starts a demo in the past, so its timeline is not in the future', async () => {
    await seeder!.reseed()

    const [campaign] = await seed!
      .select()
      .from(cases)
      .where(eq(cases.reference, 'DEMO-2026-031'))
    expect(campaign!.openedAt.getTime()).toBeLessThan(Date.now())
  })

  it('discards whatever was written to a demo', async () => {
    await seeder!.reseed()
    await seed!.update(cases).set({ title: 'scribbled on' }).where(eq(cases.isDemo, true))

    await seeder!.reseed()

    const rows = await seed!.select().from(cases).where(eq(cases.isDemo, true))
    expect(rows.map((r) => r.title)).not.toContain('scribbled on')
  })

  it('leaves a real case alone', async () => {
    // The half that costs an analyst their work if the `where` is wrong. A
    // seeder that deleted everything would pass the two tests above.
    await seed!.insert(cases).values({ reference: 'INC-9001', title: 'A real analyst case' })

    await seeder!.reseed()

    const real = await seed!.select().from(cases).where(eq(cases.isDemo, false))
    expect(real).toHaveLength(1)
    expect(real[0]!.title).toBe('A real analyst case')
  })

  it('does not accumulate demos across repeated resets', async () => {
    // Insert-without-delete is the obvious implementation and grows the list
    // by two on every restart, which looks fine until the third boot.
    await seeder!.reseed()
    await seeder!.reseed()
    await seeder!.reseed()

    const rows = await seed!.select().from(cases).where(eq(cases.isDemo, true))
    expect(rows).toHaveLength(DEMO_CASES.length)
  })
})
