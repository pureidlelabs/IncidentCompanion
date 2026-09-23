/**
 * What the demo catalogue writes, and that seeding an install somebody has
 * claimed writes none of it again.
 *
 * The suite's database is claimed before any file runs (`global-setup.ts`), so
 * the first write of an unclaimed install is driven by the lifecycle tier.
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
import { reseedDemos } from '../../test/demo-fixture.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 *
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.** Row-level security refuses an unscoped write, so a fixture on the
 * app handle fails before the test it was arranging ever runs.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null
const seeder = seed ? new DemoSeederService(seed, seed, new DemoContentSeeder()) : null

describe.skipIf(!db)('the demo cases', () => {
  beforeEach(async () => {
    await seed!.delete(cases)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  it('the catalogue writes one case per demo', async () => {
    const count = await reseedDemos(seed!)
    expect(count).toBe(DEMO_CASES.length)

    const rows = await seed!.select().from(cases).where(eq(cases.isDemo, true))
    expect(rows.map((r) => r.reference).sort()).toEqual(
      DEMO_CASES.map((d) => d.reference).sort(),
    )
  })

  it('writes the regulatory record, which no demo used to carry', async () => {
    await reseedDemos(seed!)

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
    // The reading this demo exists for, and one a case seeded at this instant
    // cannot reach -- which is what `startedDaysAgo` is for.
    await reseedDemos(seed!)

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
    await reseedDemos(seed!)

    const [campaign] = await seed!
      .select()
      .from(cases)
      .where(eq(cases.reference, 'DEMO-2026-031'))
    expect(campaign!.openedAt.getTime()).toBeLessThan(Date.now())
  })

  it('seeding a claimed install again replaces nothing and adds nothing', async () => {
    await reseedDemos(seed!)
    await seed!.update(cases).set({ title: 'an analyst wrote here' }).where(eq(cases.reference, 'DEMO-2026-047'))
    const before = await seed!.select({ id: cases.id, title: cases.title }).from(cases).orderBy(cases.id)

    expect(await seeder!.seedOnce()).toBe(0)
    expect(await seeder!.seedOnce()).toBe(0)

    expect(await seed!.select({ id: cases.id, title: cases.title }).from(cases).orderBy(cases.id)).toEqual(before)
    expect(before.map((row) => row.title)).toContain('an analyst wrote here')
  })
})
