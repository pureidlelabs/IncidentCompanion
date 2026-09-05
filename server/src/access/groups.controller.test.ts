/**
 * The routes an administrator grants and revokes reach through.
 */
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { GroupsController } from './groups.controller.js'
import { GroupsService } from './groups.service.js'
import { ReachService } from './reach.service.js'
import { CustomersService } from '../customers/customers.service.js'
import { customers, groupCustomers, groupMembers, groups, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ADMIN = 'granting-admin'
const ANALYST = 'granted-analyst'

/**
 * What the audit was told, in order, so a missing line is visible.
 */
type Line = { kind: string; by: string | undefined; subject: string; details: unknown }

/** What the audit facade is handed: a session, of which only the id matters here. */
type Caller = { session?: { user?: { id?: string } } }
const grantorOf = (caller: unknown): string | undefined =>
  (caller as Caller | undefined)?.session?.user?.id

afterAll(async () => {
  if (seed) {
    await seed.delete(groupMembers)
    await seed.delete(groupCustomers)
    await seed.delete(groups)
    await seed.delete(customers)
  }
  await pool?.end()
})

describe.skipIf(!db)('granting reach through a group', () => {
  let controller: GroupsController
  let reach: ReachService
  let written: Line[]
  let sector: string
  let theirs: string

  const caller = { user: { id: ADMIN } } as never
  const request = { headers: {} } as never

  beforeEach(async () => {
    await seed!.delete(groupMembers)
    await seed!.delete(groupCustomers)
    await seed!.delete(groups)
    await seed!.delete(customers)

    const now = new Date()
    for (const [id, name, email] of [
      [ADMIN, 'Granting Admin', 'granting@example.test'],
      [ANALYST, 'Granted Analyst', 'granted@example.test'],
    ] as const) {
      await seed!
        .insert(user)
        .values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
    }

    written = []
    const audit = {
      reachGranted: (caller: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'reach_granted', by: grantorOf(caller), subject, details })
        return Promise.resolve()
      },
      reachRevoked: (caller: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'reach_revoked', by: grantorOf(caller), subject, details })
        return Promise.resolve()
      },
      groupCreated: (caller: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'group_created', by: grantorOf(caller), subject, details })
        return Promise.resolve()
      },
      groupHeldCustomer: (caller: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'group_held_customer', by: grantorOf(caller), subject, details })
        return Promise.resolve()
      },
      groupReleasedCustomer: (caller: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'group_released_customer', by: grantorOf(caller), subject, details })
        return Promise.resolve()
      },
    }

    reach = new ReachService(db!)
    controller = new GroupsController(new GroupsService(db!), audit as never)
    await new CustomersService(db!).ensureDefault()

    const [c] = await seed!.insert(customers).values({ name: 'Their sector' }).returning()
    theirs = c!.id
    const [g] = await seed!.insert(groups).values({ name: 'Logistics' }).returning()
    sector = g!.id
  })

  /**
   * **Asserted on the source rather than on framework metadata**, which is
   * how `install-activity/coverage.test.ts` already enumerates the
   * installation's admin-gated write surface -- `@AdminOnly()` is one
   * greppable decorator on purpose, and that sweep then holds every one of
   * these routes to recording what it did.
   */
  it('is admin-only as a whole, so a route added later inherits it', () => {
    const source = readFileSync(new URL('groups.controller.ts', import.meta.url), 'utf8')
    const decorator = source.indexOf('@AdminOnly()')
    const klass = source.indexOf('export class GroupsController')

    expect(decorator, 'the controller is not admin-gated at all').toBeGreaterThan(-1)
    expect(decorator, '@AdminOnly() is on a route rather than the class').toBeLessThan(klass)
  })

  /**
   * **A group has to be makeable, or none of the rest is reachable.**
   */
  it('makes a group, which is what everything else here needs', async () => {
    const made = await controller.create({ name: 'Logistics' }, caller, request)

    const [row] = await seed!.select().from(groups).where(eq(groups.id, made.id))
    expect(row!.name).toBe('Logistics')
    expect(written.map((one) => one.kind)).toEqual(['group_created'])
  })

  it('refuses a group with no name', async () => {
    await expect(controller.create({ name: '  ' }, caller, request)).rejects.toMatchObject({
      status: 422,
    })
    expect(written).toEqual([])
  })

  it('lists the groups an install holds', async () => {
    await controller.create({ name: 'Logistics' }, caller, request)
    await controller.create({ name: 'Incident response' }, caller, request)

    const { groups: listed } = await controller.list()

    // The fixture already holds one, so this asserts what was made rather
    // than what the install contains.
    expect(listed.filter((one) => one.name === 'Incident response')).toHaveLength(1)
    expect(listed.filter((one) => one.name === 'Logistics').length).toBeGreaterThanOrEqual(2)
  })

  /**
   * The path the specification names for an administrator who needs reach: make
   * a group, put the customer in it, join at a level.
   */
  it('lets an administrator grant themselves reach through one', async () => {
    const made = await controller.create({ name: 'Mine' }, caller, request)
    await controller.hold(made.id, { customerId: theirs }, caller, request)
    await controller.grant(made.id, { userId: ADMIN, level: 'delete' }, caller, request)

    expect(await reach.levelFor(ADMIN, theirs)).toBe('delete')
  })

  it('grants a membership and reaches the customer the group holds', async () => {
    await controller.hold(sector, { customerId: theirs }, caller, request)

    await controller.grant(sector, { userId: ANALYST, level: 'write' }, caller, request)

    expect(await reach.levelFor(ANALYST, theirs)).toBe('write')
  })

  it('revokes it again', async () => {
    await controller.hold(sector, { customerId: theirs }, caller, request)
    await controller.grant(sector, { userId: ANALYST, level: 'write' }, caller, request)

    await controller.revoke(sector, ANALYST, caller, request)

    expect(await reach.levelFor(ANALYST, theirs)).toBeNull()
  })

  it('releases a customer the group held', async () => {
    await controller.hold(sector, { customerId: theirs }, caller, request)
    await controller.grant(sector, { userId: ANALYST, level: 'read' }, caller, request)

    await controller.release(sector, theirs, caller, request)

    expect(await reach.levelFor(ANALYST, theirs)).toBeNull()
  })

  /**
   * **Every act leaves a line, and the line says who it was about.**
   */
  it('writes an audit line naming the analyst for a grant and a revocation', async () => {
    await controller.grant(sector, { userId: ANALYST, level: 'delete' }, caller, request)
    await controller.revoke(sector, ANALYST, caller, request)

    expect(written.map((one) => one.kind)).toEqual(['reach_granted', 'reach_revoked'])
    expect(written.every((one) => one.subject === ANALYST)).toBe(true)
    expect(written.every((one) => one.by === ADMIN), 'the line does not say who did it').toBe(true)
    expect(written[0]?.details).toMatchObject({ level: 'delete' })
  })

  /**
   * **An administrator granting themselves, which the specification permits on
   * purpose and answers with the record rather than a refusal:**
   */
  it('names the administrator as both grantor and subject when they grant themselves', async () => {
    await controller.hold(sector, { customerId: theirs }, caller, request)
    await controller.grant(sector, { userId: ADMIN, level: 'delete' }, caller, request)

    expect(await reach.levelFor(ADMIN, theirs), 'the self-grant did not take').toBe('delete')

    const granted = written.filter((one) => one.kind === 'reach_granted')
    expect(granted).toHaveLength(1)
    expect(granted[0]?.subject, 'the line does not name who was given reach').toBe(ADMIN)
    expect(granted[0]?.by, 'the line does not name who gave it').toBe(ADMIN)
  })

  it('writes a line naming the customer when a group takes one on and lets it go', async () => {
    await controller.hold(sector, { customerId: theirs }, caller, request)
    await controller.release(sector, theirs, caller, request)

    expect(written.map((one) => one.kind)).toEqual([
      'group_held_customer',
      'group_released_customer',
    ])
    expect(written.every((one) => one.subject === theirs)).toBe(true)
  })

  /**
   * **A level the specification does not name is refused before it is written**,
   * rather than stored and resolved as nothing.
   */
  it('refuses a level that is not one of the three', async () => {
    await expect(
      controller.grant(sector, { userId: ANALYST, level: 'root' }, caller, request),
    ).rejects.toMatchObject({ status: 422 })

    expect(written).toEqual([])
  })

  it('refuses a grant naming nobody', async () => {
    await expect(
      controller.grant(sector, { level: 'read' }, caller, request),
    ).rejects.toMatchObject({ status: 422 })
  })
})
