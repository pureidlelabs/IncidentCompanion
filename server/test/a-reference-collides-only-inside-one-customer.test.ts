/**
 * The three things a case reference is allowed to do, which a uniqueness rule
 * written carelessly would take away.
 *
 * *Where a case carries a reference it MUST be unique within its customer. The
 * absence of a reference is not a value and never collides: any number of cases
 * for one customer may be waiting for theirs.*
 *
 * > #### Scenario: The same reference is used for two customers
 * > - THEN both exist
 *
 * > #### Scenario: Several cases for one customer have no reference
 * > - THEN all are created
 * > - AND none is treated as colliding with another
 *
 * > #### Scenario: A case gains its reference later
 * > - THEN it is accepted
 * > - AND the change is attributed
 *
 * **These are the requirement's permissions rather than its prohibition, and
 * the prohibition is what is missing.** #220 records that a reference is unique
 * per customer everywhere except where cases are created, so the scenario that
 * asks for a collision to be refused is not demonstrated and is not asserted
 * here. What is asserted is everything the rule must go on allowing once it
 * exists -- which is the half a `UNIQUE (customer_id, reference)` index gets
 * wrong if the empty reference is stored as a string rather than as nothing.
 *
 * So this is a ratchet against the fix, not a demonstration that the fix
 * happened. It fails the day somebody makes two unreferenced cases collide, or
 * makes one customer's ticket number block another's.
 *
 * **The customer is set through the store, and that costs the first two cases
 * their reach.** What those two therefore assert is that
 * the *store* holds no such constraint, not that a route allows it: no
 * application code runs in them, so no change to the application can redden
 * them. A schema change can, and that is what they are the ratchet against.
 *
 * The third goes through the patch route and is the one with a guard behind
 * it: omitting `reference` from `patchCaseSchema` reddens it and leaves the
 * other two green.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { cases } from '../src/db/schema/case.js'
import { customers } from '../src/db/schema/customer.js'
import { openTestPool } from './database.js'

/** One ticket number, used by two organisations, which is ordinary. */
const SHARED = `TICKET-${String(process.pid)}`

/** The one an unreferenced case is given afterwards. */
const LATER = `LATER-${String(process.pid)}`

let harness: Harness | null = null
let admin: Persona
let pool: ReturnType<typeof openTestPool> | null = null
let ours = ''
let theirs = ''
const made: string[] = []

const caseFor = async (customerId: string | null, reference: string | null) => {
  const [row] = await drizzle({ client: pool! })
    .insert(cases)
    .values({ title: 'A case with a ticket number somewhere else', customerId, reference })
    .returning({ id: cases.id, reference: cases.reference, version: cases.version })
  made.push(row!.id)
  return row!
}

const read = async (id: string) => {
  const [row] = await drizzle({ client: pool! }).select().from(cases).where(eq(cases.id, id))
  return row
}

describe.skipIf(!(await bootable()))('a case reference', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')

    const db = drizzle({ client: pool })
    const [a] = await db
      .insert(customers)
      .values({ name: `Reference Customer A ${String(process.pid)}` })
      .returning({ id: customers.id })
    const [b] = await db
      .insert(customers)
      .values({ name: `Reference Customer B ${String(process.pid)}` })
      .returning({ id: customers.id })
    ours = a!.id
    theirs = b!.id
  }, 120_000)

  afterAll(async () => {
    if (pool) {
      const db = drizzle({ client: pool })
      for (const id of made) await db.delete(cases).where(eq(cases.id, id))
      for (const id of [ours, theirs])
        if (id !== '') await db.delete(customers).where(eq(customers.id, id))
    }
    await pool?.end()
    await harness?.close()
  })

  it('is held by two customers at once, and both cases exist', async () => {
    const mine = await caseFor(ours, SHARED)
    const other = await caseFor(theirs, SHARED)

    expect(mine.id, 'the two cases are one row').not.toBe(other.id)
    expect(
      [(await read(mine.id))?.reference, (await read(other.id))?.reference],
      'one customer using a ticket number stopped another from using theirs, which is two ' +
        'organisations sharing a number and is ordinary',
    ).toEqual([SHARED, SHARED])
  })

  it('is absent from several cases for one customer without colliding', async () => {
    const first = await caseFor(ours, null)
    const second = await caseFor(ours, null)
    const third = await caseFor(ours, null)

    const held = await Promise.all([first, second, third].map((row) => read(row.id)))

    expect(
      held.map((row) => row?.id).filter(Boolean).length,
      'a case waiting for its ticket number blocked the next one, so the absence of a ' +
        'reference is being treated as a value',
    ).toBe(3)
    expect(
      held.map((row) => row?.reference),
      'an unreferenced case was stored carrying something, so two of them would collide under ' +
        'any uniqueness rule',
    ).toEqual([null, null, null])
  })

  /**
   * **On a case attributed to nobody, and that is the boundary rather than a
   * shortcut.** A case under a customer is reached through a group holding it,
   * so an administrator patching one of the cases above is answered 404 --
   * which `an-administrator-reaches-no-case-by-being-one.test.ts` is about.
   * What this case is about is the act of supplying a reference, which is the
   * same act either way; the customer matters to the collision rule, and the
   * collision rule is #220's.
   */
  it('is accepted later, and the change says who made it', async () => {
    const blank = await caseFor(null, null)

    const answer = await fetch(`${harness!.base}/api/cases/${blank.id}`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reference: LATER, version: blank.version }),
    })
    const said = await answer.text()
    expect(answer.status, `the reference was refused: ${said}`).toBe(200)

    const after = await read(blank.id)
    expect(after?.reference, 'the case did not take the reference it was given').toBe(LATER)
    expect(
      after?.updatedBy,
      'the case gained a reference and the change names nobody, so an attribution the ' +
        'requirement asks for is missing',
    ).toBeTruthy()
  })
})
