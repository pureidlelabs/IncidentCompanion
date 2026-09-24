/**
 * What the administrator is shown of somebody's reach is the level the store
 * decides, for every account and every customer.
 *
 * `reachOf` and `reachTo` explain a level by the grant behind it, and the store
 * decides the level. An explanation settling a level its own way would tell an
 * administrator somebody can do what the store refuses them, or the reverse --
 * so each is held to the store's answer over a spread of grants: no group, one,
 * two disagreeing, the default customer's floor for each role, and a group
 * raising it.
 */
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ReachService } from './reach.service.js'
import { customers, groupCustomers, groupMembers, groups, user } from '../db/schema/index.js'
import { asRole, levelIn, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null
const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

const STAMP = `${String(process.pid)}-${String(Date.now())}`
const PEOPLE = {
  nobody: `explains-nobody-${STAMP}`,
  reader: `explains-reader-${STAMP}`,
  twice: `explains-twice-${STAMP}`,
  admin: `explains-admin-${STAMP}`,
}

describe.skipIf(!db)('a level explained by its grant', () => {
  let reach: ReachService
  const made: { customers: string[]; groups: string[] } = { customers: [], groups: [] }

  beforeAll(async () => {
    reach = new ReachService(db!)
    const now = new Date()
    for (const [key, id] of Object.entries(PEOPLE)) {
      await seed!.insert(user).values({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
        role: key === 'admin' ? 'admin' : 'analyst',
      })
    }
    const [fallback] = await seed!.select().from(customers).where(eq(customers.isDefault, true))
    const [one, two] = await seed!
      .insert(customers)
      .values([{ name: `Explained one ${STAMP}` }, { name: `Explained two ${STAMP}` }])
      .returning()
    made.customers.push(one!.id, two!.id)
    const [reads, writes, deletes] = await seed!
      .insert(groups)
      .values([
        { name: `reads ${STAMP}` },
        { name: `writes ${STAMP}` },
        { name: `deletes ${STAMP}` },
      ])
      .returning()
    made.groups.push(reads!.id, writes!.id, deletes!.id)
    await seed!.insert(groupCustomers).values([
      { groupId: reads!.id, customerId: one!.id },
      { groupId: writes!.id, customerId: one!.id },
      { groupId: writes!.id, customerId: two!.id },
      { groupId: deletes!.id, customerId: fallback!.id },
    ])
    await seed!.insert(groupMembers).values([
      { groupId: reads!.id, userId: PEOPLE.reader, level: 'read' },
      { groupId: reads!.id, userId: PEOPLE.twice, level: 'read' },
      { groupId: writes!.id, userId: PEOPLE.twice, level: 'write' },
      { groupId: deletes!.id, userId: PEOPLE.twice, level: 'delete' },
    ])
    made.customers.push(fallback!.id)
  })

  afterAll(async () => {
    await seed!.delete(groups).where(inArray(groups.id, made.groups))
    await seed!.delete(customers).where(inArray(customers.id, made.customers.slice(0, 2)))
    await seed!.delete(user).where(inArray(user.id, Object.values(PEOPLE)))
    await pool!.end()
    await seedPool!.end()
  })

  it.each(Object.keys(PEOPLE))('shows %s the levels the store decides', async (key) => {
    const who = PEOPLE[key as keyof typeof PEOPLE]
    const shown = new Map((await reach.reachOf(who))!.map((one) => [one.customerId, one.level]))
    for (const customerId of made.customers) {
      expect(shown.get(customerId) ?? null, `${key} over ${customerId}`).toBe(
        await levelIn(db!, who, customerId),
      )
    }
  })

  it('shows each customer the levels the store decides for every account', async () => {
    for (const customerId of made.customers) {
      const shown = new Map(
        (await reach.reachTo(customerId))!.map((one) => [one.userId, one.level]),
      )
      for (const who of Object.values(PEOPLE)) {
        expect(shown.get(who) ?? null, `${who} over ${customerId}`).toBe(
          await levelIn(db!, who, customerId),
        )
      }
    }
  })
})
