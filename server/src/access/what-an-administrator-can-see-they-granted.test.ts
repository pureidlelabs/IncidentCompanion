/**
 * **An administrator can answer what each account reaches, why, and who
 * reaches a customer** -- without leaving the application.
 *
 * The reach model was built and had nothing in front of it: `GET /api/groups`
 * answered names, and the other five routes were writes. So *why does this
 * analyst reach this customer* and *who reaches this customer* had no route at
 * all, and an administrator could grant reach and not see what they had
 * granted. -> #208
 *
 * **What granted it is the half that makes the answer useful.** A level with no
 * provenance tells an administrator that somebody reaches a customer and not
 * which grant to revoke, which is the question they are asking when they look.
 *
 * **The default customer is one of the answers.** Reaching it was never a
 * membership -- every analyst reaches it by role -- so it is reported as the
 * floor rather than attributed to a group nobody made.
 *
 * **What this does not cover:** whether an account is local or the provider's,
 * and a second factor. Both are unbuilt, and the two scenarios resting on them
 * wait on federation rather than on this.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ReachService } from './reach.service.js'
import { GroupsService } from './groups.service.js'
import { customers } from '../db/schema/customer.js'
import { groups, groupCustomers, groupMembers } from '../db/schema/groups.js'
import { user } from '../db/schema/auth.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env['DATABASE_URL'] ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const ALEX = 'reach-alex'
const SAM = 'reach-sam'

describe.skipIf(!db)('what an administrator can see they granted', () => {
  let reach: ReachService
  let acme = ''
  let fallback = ''
  let dayShift = ''

  beforeEach(async () => {
    await db!.delete(groupMembers)
    await db!.delete(groupCustomers)
    await db!.delete(groups)
    await db!.delete(customers)

    const now = new Date()
    for (const [id, name] of [
      [ALEX, 'Alex Analyst'],
      [SAM, 'Sam Analyst'],
    ] as const) {
      await db!
        .insert(user)
        .values({
          id,
          name,
          email: `${id}@example.test`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }

    const [made] = await db!
      .insert(customers)
      .values({ name: 'Unattributed', isDefault: true })
      .returning()
    fallback = made!.id
    const [one] = await db!.insert(customers).values({ name: 'Acme NV' }).returning()
    acme = one!.id

    const [group] = await db!.insert(groups).values({ name: 'Day shift' }).returning()
    dayShift = group!.id
    await db!.insert(groupCustomers).values({ groupId: dayShift, customerId: acme })
    await db!.insert(groupMembers).values({ groupId: dayShift, userId: ALEX, level: 'write' })

    reach = new ReachService(db!)
  })

  afterAll(async () => {
    await db!.delete(groupMembers)
    await db!.delete(groupCustomers)
    await db!.delete(groups)
    await db!.delete(customers)
    await db!.delete(user).where(eq(user.id, ALEX))
    await db!.delete(user).where(eq(user.id, SAM))
    await pool?.end()
  })

  describe('for an account', () => {
    it('names every customer it reaches, the level, and what granted it', async () => {
      const held = await reach.reachOf(ALEX)

      expect(
        held.find((one) => one.customerId === acme),
        'the customer a group holds is not reported at all',
      ).toMatchObject({
        customerName: 'Acme NV',
        level: 'write',
        granted: { by: 'group', groupName: 'Day shift' },
      })
    })

    /**
     * **Reaching the default was never a membership**, so attributing it to a
     * group would send an administrator looking for one to revoke.
     */
    it('reports the default customer as the floor, not as a grant', async () => {
      const held = await reach.reachOf(SAM)

      expect(held.map((one) => one.customerId), 'an analyst in no group reaches nothing').toEqual([
        fallback,
      ])
      expect(held[0]?.granted, 'the floor is reported as though somebody granted it').toEqual({
        by: 'default',
      })
    })

    it('reports the strongest level where two groups grant one customer', async () => {
      const [second] = await db!.insert(groups).values({ name: 'Night shift' }).returning()
      await db!.insert(groupCustomers).values({ groupId: second!.id, customerId: acme })
      await db!.insert(groupMembers).values({ groupId: second!.id, userId: ALEX, level: 'delete' })

      const held = await reach.reachOf(ALEX)
      const row = held.find((one) => one.customerId === acme)

      expect(row?.level, 'the weaker grant was reported as what the analyst reaches').toBe('delete')
      expect(
        row?.granted,
        'the grant that decided the level is not the one named',
      ).toMatchObject({ by: 'group', groupName: 'Night shift' })
    })
  })

  describe('from the customer', () => {
    it('names every analyst who reaches it, the level, and what granted it', async () => {
      const held = await reach.reachTo(acme)

      expect(held, 'nobody is reported as reaching a customer a group holds').toHaveLength(1)
      expect(held[0]).toMatchObject({
        userId: ALEX,
        username: `${ALEX}@example.test`,
        level: 'write',
        granted: { by: 'group', groupName: 'Day shift' },
      })
    })

    /**
     * **Every account, not every member**, because reaching the default is the
     * floor rather than a membership. Asserted as containment: this suite runs
     * against a database that already holds other personas, and an exact
     * roster here would be a claim about them.
     */
    it('reports every analyst on the default customer, by the floor', async () => {
      const held = await reach.reachTo(fallback)
      const mine = held.filter((one) => one.userId === ALEX || one.userId === SAM)

      expect(
        mine.map((one) => one.userId).sort(),
        'an analyst in no group is missing from the default customer',
      ).toEqual([ALEX, SAM].sort())
      expect(
        mine.every((one) => one.granted.by === 'default'),
        'the floor is attributed to a group nobody made',
      ).toBe(true)
    })
  })

  describe('for a group', () => {
    it('names who is in it and which customers it holds', async () => {
      const held = await new GroupsService(db!).membership(dayShift)

      expect(held.members, 'a group reports nobody in it').toMatchObject([
        { userId: ALEX, username: `${ALEX}@example.test`, level: 'write' },
      ])
      expect(held.customers, 'a group reports none of the customers it holds').toMatchObject([
        { customerId: acme, customerName: 'Acme NV' },
      ])
    })
  })
})
