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
   * is not asserted here. Establishing that a line reveals nothing about the
   * case's contents means enumerating what the contents were, and the
   * `detail` column is a free-form object; that is a stronger claim than this
   * case makes, and claiming it would be the kind of name-over-assertion this
   * suite has enough of.
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
})
