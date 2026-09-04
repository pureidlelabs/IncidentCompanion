/**
 * The routes an administrator keeps the customer directory through.
 *
 * **`CustomersService` had every rule and no caller**, which is how three
 * defects survived in `merge` alone: a set reused for two purposes, a
 * duplicated comparison, and a refusal message that named the wrong thing.
 * Code exercised only by its own test accumulates exactly that, because the
 * test was written from the same understanding as the code.
 *
 * What is asserted here is the layer this file adds -- that the acts are
 * admin-only, that each leaves an audit line, and that a refusal from the
 * service reaches the caller as a refusal rather than a 500. The rules
 * themselves are asserted against the service.
 */
import { ParseUUIDPipe } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_ROLE } from '../auth/auth.config.js'
import { CustomersController } from './customers.controller.js'
import { CustomersService } from './customers.service.js'
import { SETTABLE_FACTS } from './customers.controller.js'
import { MERGE_FACTS } from './organisation-facts.js'
import { cases, customers, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ADMIN = 'directory-admin'

type Line = { kind: string; subject: string; detail?: Record<string, string> }

afterAll(async () => {
  if (seed) {
    await seed.delete(cases)
    await seed.delete(customers)
  }
  await pool?.end()
})

describe.skipIf(!db)('keeping the customer directory', () => {
  let controller: CustomersController
  let service: CustomersService
  let written: Line[]
  let theDefault: string

  const caller = { user: { id: ADMIN } } as never
  const request = { headers: {} } as never

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ADMIN,
        name: 'Directory Admin',
        email: 'directory@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    written = []
    const audit = {
      customerCreated: (_c: unknown, subject: string) => {
        written.push({ kind: 'customer_created', subject })
        return Promise.resolve()
      },
      customerChanged: (_c: unknown, subject: string) => {
        written.push({ kind: 'customer_changed', subject })
        return Promise.resolve()
      },
      customerRemoved: (_c: unknown, subject: string, name: string) => {
        written.push({ kind: 'customer_removed', subject, detail: { name } })
        return Promise.resolve()
      },
      customersMerged: (_c: unknown, subject: string, detail: Record<string, string>) => {
        written.push({ kind: 'customers_merged', subject, detail })
        return Promise.resolve()
      },
    }

    service = new CustomersService(db!)
    controller = new CustomersController(service, audit as never)
    theDefault = (await service.ensureDefault()).id
  })

  /**
   * **Read off the metadata the guard reads, not off the file's text**, which
   * any comment naming the decorator satisfies.
   *
   * On the class and absent from every handler is the whole claim: that is
   * what makes a route added later inherit it.
   */
  it('is admin-only as a whole, so a route added later inherits it', () => {
    expect(Reflect.getMetadata('ROLES', CustomersController), 'the directory is not admin-gated').toEqual([
      ADMIN_ROLE,
    ])

    for (const route of ['list', 'create', 'change', 'remove', 'merge'] as const) {
      // Off the descriptor rather than the property, which reads as an unbound
      // method to eslint and is not one -- nothing calls it.
      const handler = Object.getOwnPropertyDescriptor(CustomersController.prototype, route)
        ?.value as object
      expect(
        Reflect.getMetadata('ROLES', handler),
        `${route} carries its own role marking, so the class-level gate is not what holds`,
      ).toBeUndefined()
    }
  })

  /**
   * **A malformed id is a 400 from the pipe, not a 500 from the driver**:
   * `change()` puts the value straight into `eq(customers.id, id)`.
   *
   * **Asserted off the route metadata, and it has to be.** Every case around
   * it calls the handler directly, where no pipe runs -- so this defect is
   * invisible from inside the tier that was watching.
   */
  it('refuses a malformed id at the pipe, on every route that takes one', () => {
    for (const route of ['change', 'remove', 'merge'] as const) {
      const meta = (Reflect.getMetadata(ROUTE_ARGS_METADATA, CustomersController, route) ??
        {}) as Record<string, { data?: unknown; pipes?: unknown[] }>
      const id = Object.values(meta).find((one) => one.data === 'id')

      expect(id, `${route} takes no :id parameter`).toBeDefined()
      expect(id!.pipes ?? [], `${route} takes :id without ParseUUIDPipe`).toContain(ParseUUIDPipe)
    }
  })

  it('creates a customer and records it', async () => {
    const made = await controller.create({ name: 'Northwind BV' }, caller, request)

    const [row] = await seed!.select().from(customers).where(eq(customers.id, made.id))
    expect(row!.name).toBe('Northwind BV')
    expect(row!.isDefault, 'a created customer must not be a second default').toBe(false)
    expect(written.map((one) => one.kind)).toEqual(['customer_created'])
  })

  /**
   * **A null into a `NOT NULL` column is a 500, and the route is what has to
   * stop it.** `z.unknown().optional()` guards `undefined` and admits an
   * explicit `null`, so the value reached Postgres and raised 23502 -- and
   * nothing in this tree maps a Postgres error to a status, so the caller was
   * told the install is broken when they had sent a bad body.
   *
   * Four columns are `notNull()`, so this is the ordinary shape of the bug
   * rather than a contrived one.
   */
  it.each(['outsideEuReach', 'outsideEuCountries', 'competentAuthority', 'dpoContact'])(
    'refuses an explicit null for %s rather than letting the database refuse it',
    async (field) => {
      await expect(
        controller.create({ name: 'Northwind BV', [field]: null }, caller, request),
      ).rejects.toMatchObject({ status: 422 })
    },
  )

  /**
   * **A name list gives names without types.** The set said which keys were
   * allowed and never what values were, so a number where text belongs and a
   * string where an array belongs both reached the database.
   */
  it.each([
    ['usersTotalCount', 'not a number'],
    ['regimes', 'gdpr'],
    ['competentAuthority', 42],
    ['outsideEuReach', 'yes'],
  ])('refuses %s given as %o', async (field, value) => {
    await expect(
      controller.create({ name: 'Northwind BV', [field]: value }, caller, request),
    ).rejects.toMatchObject({ status: 422 })
  })

  /**
   * **A typo is refused rather than dropped.** `mergeSchema` was strict and
   * these two were not, so a misspelled field 422'd on one route and vanished
   * on the other -- and the vanishing is the worse half, because the
   * administrator believes the value landed.
   */
  it('refuses a field it does not know rather than stripping it', async () => {
    await expect(
      controller.create({ name: 'Northwind BV', competentAuthorty: 'RDI' }, caller, request),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a name longer than the column holds', async () => {
    await expect(
      controller.create({ name: 'x'.repeat(500) }, caller, request),
    ).rejects.toMatchObject({ status: 422 })
  })

  /**
   * **The derivation is kept as the check, not as the contract.** A column
   * added to `customers` must not become caller-settable by default -- that is
   * fail-open at a trust boundary, the opposite polarity to the merge, where
   * forgetting one is merely noisy. So the input schema is written out, and
   * this is what refuses to let it drift from the facts.
   */
  it('accepts exactly the organisation facts a merge can dispute', () => {
    expect([...SETTABLE_FACTS].sort()).toEqual([...MERGE_FACTS].sort())
  })

  it('refuses a customer with no name', async () => {
    await expect(controller.create({ name: '  ' }, caller, request)).rejects.toMatchObject({
      status: 422,
    })
    expect(written).toEqual([])
  })

  /**
   * **A rename leaves everything pointing at it.** The first requirement rests
   * on the identity being the generated id, and this is the act that would
   * find out otherwise.
   */
  it('renames without moving the identity', async () => {
    const made = await controller.create({ name: 'Northwind BV' }, caller, request)
    written.length = 0

    await controller.change(made.id, { name: 'Northwind B.V.' }, caller, request)

    const [row] = await seed!.select().from(customers).where(eq(customers.id, made.id))
    expect(row!.id).toBe(made.id)
    expect(row!.name).toBe('Northwind B.V.')
    expect(written.map((one) => one.kind)).toEqual(['customer_changed'])
  })

  it('lists what the install holds, the default among them', async () => {
    await controller.create({ name: 'Northwind BV' }, caller, request)

    const { customers: listed } = await controller.list()

    expect(listed.map((one) => one.id)).toContain(theDefault)
    expect(listed.some((one) => one.name === 'Northwind BV')).toBe(true)
  })

  /**
   * **A refusal from the service reaches the caller as a refusal.** Letting it
   * escape as a 500 would tell an administrator the install is broken when it
   * is telling them something true about their data.
   */
  it('passes the refusal through when cases stand behind a customer', async () => {
    const made = await controller.create({ name: 'Has cases' }, caller, request)
    await seed!.insert(cases).values({ title: 'One', customerId: made.id })
    written.length = 0

    await expect(controller.remove(made.id, caller, request)).rejects.toMatchObject({
      status: 409,
      response: { message: expect.stringContaining('1 case') },
    })
    expect(written, 'a refused removal was recorded as one').toEqual([])
  })

  it('removes a customer nothing stands behind, and records it', async () => {
    const made = await controller.create({ name: 'Nothing behind it' }, caller, request)
    written.length = 0

    await controller.remove(made.id, caller, request)

    const [gone] = await seed!.select().from(customers).where(eq(customers.id, made.id))
    expect(gone).toBeUndefined()
    expect(written.map((one) => one.kind)).toEqual(['customer_removed'])
    // **The name, not the id.** After the delete the id joins to nothing, so a
    // line carrying only it is the one nobody can look up -- which is the rule
    // `caseDeleted` states and this followed the other way.
    expect(written[0]!.detail).toMatchObject({ name: 'Nothing behind it' })
  })

  it('refuses to remove the default', async () => {
    await expect(controller.remove(theDefault, caller, request)).rejects.toMatchObject({
      status: 409,
    })
  })

  /**
   * **404 for a customer that is not there, not 422.** `wire/refusals.ts` puts
   * a write refused for a reason the analyst can act on at 422; a record named
   * in the path that does not exist is not one of those, and the case guard
   * beside it already answers 404 for the same shape of miss.
   */
  it.each(['change', 'remove'] as const)('answers 404 from %s for a customer that is not there', async (act) => {
    const absent = '00000000-0000-4000-8000-000000000000'
    const call =
      act === 'change'
        ? controller.change(absent, { name: 'Renamed' }, caller, request)
        : controller.remove(absent, caller, request)

    await expect(call).rejects.toMatchObject({ status: 404 })
    expect(written, 'an act that refused was recorded as one that happened').toEqual([])
  })

  /**
   * The act `merge` existed for and had no caller. The rules are the service's
   * and are asserted there; what is asserted here is that they are reachable
   * and attributed.
   */
  it('merges one record into another, and records it against the survivor', async () => {
    const losing = await controller.create({ name: 'Northwind BV' }, caller, request)
    const surviving = await controller.create({ name: 'Northwind B.V.' }, caller, request)
    await seed!.insert(cases).values({ title: 'Came across', customerId: losing.id })
    written.length = 0

    await controller.merge(surviving.id, { losing: losing.id, choices: {} }, caller, request)

    const [gone] = await seed!.select().from(customers).where(eq(customers.id, losing.id))
    expect(gone).toBeUndefined()
    expect(written).toEqual([
      {
        kind: 'customers_merged',
        subject: surviving.id,
        // The losing name travels with its id, for the reason above: the id
        // resolves to nothing the moment the merge finishes.
        detail: { losing: losing.id, losingName: 'Northwind BV' },
      },
    ])
  })

  it('passes a disagreement back rather than choosing', async () => {
    const losing = await controller.create({ name: 'A' }, caller, request)
    const surviving = await controller.create({ name: 'B' }, caller, request)
    await seed!
      .update(customers)
      .set({ competentAuthority: 'RDI' })
      .where(eq(customers.id, losing.id))
    written.length = 0

    await expect(
      controller.merge(surviving.id, { losing: losing.id, choices: {} }, caller, request),
    ).rejects.toMatchObject({
      status: 409,
      response: { message: expect.stringContaining('competentAuthority') },
    })
    expect(written).toEqual([])
  })
})
