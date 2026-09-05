/**
 * A line keeps the identity it was written with, whatever the mapping says now.
 *
 * *A line MUST carry that vocabulary's own identity for what it records,
 * decided when the line is written, so that what a line means does not change
 * when the install is upgraded.* Its scenario is *lines written before an
 * upgrade still say what they said when they were written*.
 *
 * **The upgrade is simulated from the other side.** Changing `MAP` would be a
 * change to the thing under test, so instead a row is written carrying a
 * classification the current mapping would never produce for its event -- which
 * is exactly what a row written by an older build looks like once the mapping
 * has moved.
 *
 * **The control is that today's mapping disagrees with the stored row.** A
 * reader that recomputed the classification would return the disagreeing value,
 * and without the control a stored row that happened to match the current
 * mapping would pass whichever the reader did.
 *
 * `categoryUid` and `className` are derived at read time and are *not* a
 * violation: both are keyed on the stored `classUid`, so they follow the row's
 * own identity rather than its event's.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CLASS, OCSF_VERSION, classify } from '../install-activity/ocsf.js'
import { InstallActivityReadService } from './read.service.js'
import { installActivity } from '../db/schema/install-activity.js'
import { user } from '../db/schema/auth.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/**
 * A sign-in, recorded as an account change.
 *
 * Deliberately the wrong class for the event: `signed_in` maps to
 * Authentication, so nothing writing rows today could produce this pairing and
 * a reader returning it can only have read it.
 */
const AS_WRITTEN = {
  event: 'signed_in' as const,
  channel: 'authentication' as const,
  classUid: CLASS.accountChange.uid,
  activityId: 3,
  typeUid: CLASS.accountChange.uid * 100 + 3,
  severityId: 1,
  statusId: 1,
}

const asAdmin = { user: { id: 'audit-reader', role: 'admin' } } as never

describe.skipIf(!db)('a line written before an upgrade', () => {
  let reader: InstallActivityReadService
  let id: string

  beforeAll(async () => {
    reader = new InstallActivityReadService(db!)

    // The reader is a real account: `page` records the read, and a line whose
    // actor does not exist fails its foreign key and logs an error beside a
    // passing run.
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: 'audit-reader',
        name: 'Audit Reader',
        email: 'audit-reader@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [row] = await seed!.insert(installActivity).values(AS_WRITTEN).returning({ id: installActivity.id })
    id = row!.id
  }, 90_000)

  afterAll(async () => {
    await seed!.delete(installActivity).where(eq(installActivity.id, id))
    await pool!.end()
  })

  it("today's mapping disagrees with it, so reading it back proves something", () => {
    const now = classify(AS_WRITTEN.event)
    expect(
      now.classUid,
      'the stored class is what the current mapping produces, so this row cannot tell a ' +
        'reader that stores from one that recomputes',
    ).not.toBe(AS_WRITTEN.classUid)
  })

  /**
   * *The line identifies itself in a published vocabulary, and names the
   * version of that vocabulary.*
   *
   * **Every line, not the written one.** `metadata` is built per row, so a
   * reader that filled it in for some rows and not others is the failure this
   * catches; a check on one line cannot see it.
   */
  it('names its vocabulary and that vocabulary version on every line', async () => {
    const page = await reader.page({ limit: 200 }, asAdmin, {})
    expect(page.events.length, 'no line came back, so nothing is being read').toBeGreaterThan(0)

    const unnamed = page.events
      .filter((one) => one.metadata?.version !== OCSF_VERSION || !one.typeUid)
      .map((one) => `${one.id}: version=${String(one.metadata?.version)} typeUid=${String(one.typeUid)}`)

    expect(
      unnamed,
      'these lines do not say which vocabulary version they were written against, so a ' +
        'collector has to infer the shape it is mapping',
    ).toEqual([])
  })

  it('is read back with the identity it was written with', async () => {
    const page = await reader.page({ limit: 200 }, asAdmin, {})
    const line = page.events.find((one) => one.id === id)

    expect(line, 'the written line did not come back at all').toBeDefined()
    expect(
      {
        classUid: line!.classUid,
        activityId: line!.activityId,
        typeUid: line!.typeUid,
      },
      'the line was reclassified on the way out, so what it means changed when the ' +
        'mapping did',
    ).toEqual({
      classUid: AS_WRITTEN.classUid,
      activityId: AS_WRITTEN.activityId,
      typeUid: AS_WRITTEN.typeUid,
    })
  })
})
