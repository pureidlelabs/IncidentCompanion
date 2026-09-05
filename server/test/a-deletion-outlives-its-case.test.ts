/**
 * That the record of a deletion survives the case it records.
 *
 * **This is the whole reason `case_deleted` is in the install's vocabulary
 * rather than the case's own feed.** `change_feed` cascades with the case, so
 * the per-case log is destroyed by the one event it would most need to record
 * -- and `cases` requires the opposite: *a record of the deletion remains,
 * naming the analyst, the moment, and the case's identity*, and *that record
 * is readable after the case is gone*.
 *
 * **Nothing tested it against the table.** `cases.write.test.ts` asserts the
 * route calls the audit service, through a recorder standing in for it, which
 * is the right subject for that file and cannot see this one: a foreign key
 * added to `install_activity` with `on delete cascade` would satisfy every
 * existing case and destroy the line at the moment it matters.
 *
 * Driven through the endpoints, so what is exercised is the real service, the
 * real table and the real delete rather than a service built by hand.
 */
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { boot, bootable, grantsItselfDelete, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { cases, installActivity } from '../src/db/schema/index.js'

const RUNNABLE = await bootable()

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * **`ic_seed`, because marking a case as demonstration content is a fixture
 * rather than an act the product offers.** There is no route that seeds one,
 * and the app role may not write outside a case scope.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!RUNNABLE || !db)('the record of a deletion', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    // **Deleting a case needs `delete`, and the default customer's guarantee
    // stops at write** -- so the administrator takes the path the requirement
    // names: make a group, put the customer in it, join at delete. The grant
    // is logged naming them as both grantor and subject, which is what the
    // product offers in place of a restriction.
    await grantsItselfDelete(harness, admin)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
    await pool?.end()
    if (seedPool !== pool) await seedPool?.end()
  })

  /** Opens a case with a title only this run uses, and answers its id. */
  async function openCase(title: string): Promise<string> {
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title }),
    })
    if (!made.ok) throw new Error(`opening a case answered ${String(made.status)}`)
    return ((await made.json()) as { id: string }).id
  }

  it('is still readable once the case it names is gone', async () => {
    const title = `Deletion outlives ${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    const id = await openCase(title)

    const removed = await fetch(`${harness.base}/api/cases/${id}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })
    expect(removed.ok, 'the case was not deleted, so this proves nothing').toBe(true)

    // The premise: the case really is gone, not merely hidden.
    expect(await db!.select().from(cases).where(eq(cases.id, id))).toHaveLength(0)

    const [line] = await db!
      .select()
      .from(installActivity)
      .where(and(eq(installActivity.event, 'case_deleted'), eq(installActivity.targetLabel, title)))

    expect(line, 'the deletion took its own record with it').toBeDefined()

    /**
     * **The analyst, the moment and the case's identity**, which is what the
     * requirement asks the line to carry. The title is the identity here for
     * the reason the controller reads it before deleting: after the delete
     * there is no row to join to, and a line naming a bare uuid answers
     * nothing to somebody asking what happened.
     */
    expect(line!.actorId, 'the line does not say who').toBeTruthy()
    expect(line!.at, 'the line does not say when').toBeInstanceOf(Date)
    expect(line!.detail, 'the line does not name the case').toMatchObject({ caseId: id })
  }, 90_000)

  /**
   * **Asked about the identifier afterwards, the install can still answer.**
   * The second scenario's first half: it can say the case existed and was
   * deleted, by whom and when.
   *
   * Its second half -- that it does not disclose what the case contained --
   * is the case below.
   */
  it('answers about the identifier, not only about the title', async () => {
    const title = `Asked afterwards ${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    const id = await openCase(title)

    await fetch(`${harness.base}/api/cases/${id}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })

    const found = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'case_deleted'))

    const ours = found.filter((one) => (one.detail as { caseId?: string })?.caseId === id)
    expect(ours, 'the identifier answers nothing after the case is gone').toHaveLength(1)
    expect(ours[0]?.targetLabel, 'the line does not carry the identity it was given').toBe(title)
  }, 90_000)

  /**
   * **The second half of that scenario: the line says a case existed and not
   * what was in it.**
   *
   * The case above deliberately stopped short of this, on the grounds that
   * `detail` is free-form and the claim is stronger than it was making. It is
   * assertable by putting a value in the case that appears nowhere else and
   * looking for it across the whole record rather than in a named column --
   * which is also the only form that survives somebody adding a column to
   * `install_activity` later.
   */
  it('does not carry what the case contained', async () => {
    /**
     * **Not in the title**, which the record carries on purpose as the case's
     * identity. The canary has to be something only the *contents* hold, or
     * this asserts that the line does not name the case it is about.
     */
    const canary = `CANARY-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    const title = `Contents withheld ${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    const id = await openCase(title)

    const added = await fetch(`${harness.base}/api/cases/${id}/systems`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ hostname: canary }),
    })
    expect(added.ok, 'nothing was recorded in the case, so there is nothing to withhold').toBe(true)

    await fetch(`${harness.base}/api/cases/${id}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })

    const lines = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'case_deleted'))

    /**
     * Serialised whole rather than read column by column: the claim is about
     * the record, and a column added later would escape a named check while
     * carrying exactly what this forbids.
     */
    const whole = (row: unknown): string =>
      // `seq` is a bigint, which the serialiser refuses outright.
      JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? String(value) : value))

    /**
     * **The positive control, and it is why the negative below means
     * anything.** A search that cannot find a value which *is* there passes
     * the assertion after it just as green as the property holding would --
     * a narrowed select, a transformed value, a serialiser that dropped a
     * column. The title is carried on purpose, so finding it proves the search
     * reaches the record, on the same rows and through the same serialiser.
     */
    expect(
      lines.filter((one) => whole(one).includes(title)).length,
      'the search cannot find a value the record is known to carry, so the assertion ' +
        'below would pass whatever the audit contained',
    ).toBe(1)

    const leaking = lines.filter((one) => whole(one).includes(canary))

    expect(
      leaking.map((one) => one.id),
      "the deletion record carries a value from inside the case, so the audit of what " +
        'happened to a case is also a copy of what was in it',
    ).toEqual([])
  }, 90_000)

  /**
   * **The exception, and it is the same property read the other way.**
   * Demonstration content records no investigation, so its removal leaves
   * nothing to account for -- *including no deletion record*.
   *
   * It belongs beside the cases above rather than in a file of its own,
   * because what is being asserted is the difference between them: either one
   * alone passes against a route that always writes the line, or against one
   * that never does.
   *
   * The route wrote it unconditionally until #146.
   */
  it('leaves nothing behind a demonstration case', async () => {
    const title = `Demonstration ${String(Date.now())}-${String(Math.random()).slice(2, 8)}`
    const [going] = await seed!
      .insert(cases)
      .values({ title, isDemo: true })
      .returning({ id: cases.id, isDemo: cases.isDemo })

    expect(going!.isDemo, 'the fixture is not marked as demonstration content').toBe(true)

    const removed = await fetch(`${harness.base}/api/cases/${going!.id}`, {
      method: 'DELETE',
      headers: { cookie: admin.cookie },
    })
    expect(removed.ok, 'the demonstration case was not deleted, so this proves nothing').toBe(true)

    const found = await db!
      .select()
      .from(installActivity)
      .where(eq(installActivity.event, 'case_deleted'))

    const ours = found.filter((one) => (one.detail as { caseId?: string })?.caseId === going!.id)
    expect(
      ours,
      'a demonstration case left a deletion record, so an install that has only ever run ' +
        'the demo accumulates an audit of investigations that never happened',
    ).toHaveLength(0)
  }, 90_000)
})
