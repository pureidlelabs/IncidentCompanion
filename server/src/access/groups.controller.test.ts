/**
 * The routes an administrator grants and revokes reach through.
 *
 * **Every one of them is an install-level write, so every one owes an audit
 * line.** `GroupsService` is where the rules are and it records nothing - a
 * service called from a seeder or a migration has no caller to attribute - so
 * the line is written here, where there is a session to name.
 *
 * That the whole controller is admin-only is asserted on the source, which is
 * how `install-activity/coverage.test.ts` already enumerates the
 * installation's admin-gated write surface - `@AdminOnly()` is one greppable
 * decorator on purpose. Applied to the class, so a route added tomorrow
 * inherits it rather than being the one somebody forgot.
 */
import { readFileSync } from 'node:fs'
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

/** What the audit was told, in order, so a missing line is visible. */
type Line = { kind: string; subject: string; details: unknown }

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
      reachGranted: (_c: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'reach_granted', subject, details })
        return Promise.resolve()
      },
      reachRevoked: (_c: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'reach_revoked', subject, details })
        return Promise.resolve()
      },
      groupHeldCustomer: (_c: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'group_held_customer', subject, details })
        return Promise.resolve()
      },
      groupReleasedCustomer: (_c: unknown, subject: string, details: unknown) => {
        written.push({ kind: 'group_released_customer', subject, details })
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
   *
   * Applied to the class, so a route added here tomorrow inherits it rather
   * than being the one somebody forgot.
   */
  it('is admin-only as a whole, so a route added later inherits it', () => {
    const source = readFileSync(new URL('groups.controller.ts', import.meta.url), 'utf8')
    const decorator = source.indexOf('@AdminOnly()')
    const klass = source.indexOf('export class GroupsController')

    expect(decorator, 'the controller is not admin-gated at all').toBeGreaterThan(-1)
    expect(decorator, '@AdminOnly() is on a route rather than the class').toBeLessThan(klass)
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
   * **Every act leaves a line, and the line says who it was about.** An audit
   * that recorded the act without the analyst answers half the question
   * somebody opens it with.
   */
  it('writes an audit line naming the analyst for a grant and a revocation', async () => {
    await controller.grant(sector, { userId: ANALYST, level: 'delete' }, caller, request)
    await controller.revoke(sector, ANALYST, caller, request)

    expect(written.map((one) => one.kind)).toEqual(['reach_granted', 'reach_revoked'])
    expect(written.every((one) => one.subject === ANALYST)).toBe(true)
    expect(written[0]?.details).toMatchObject({ level: 'delete' })
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
   * **A level the specification does not name is refused before it is
   * written**, rather than stored and resolved as nothing. The set is the
   * schema's, so a level added there is accepted here without an edit.
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
