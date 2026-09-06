/**
 * Giving a case its customer.
 *
 * **What is asserted here is the act and its record.** That reach follows the
 * new customer is the guard's existing behaviour rather than this route's, and
 * it is demonstrated where reach is demonstrated -- through a booted app, in
 * `server/test/a-case-moves-to-its-customer.test.ts`. Asserting it here would
 * be asserting the guard against a request this file built.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CaseCustomerController } from './customer.controller.js'
import { CasesService } from './cases.service.js'
import { CustomersService } from '../customers/customers.service.js'
import { cases, customers } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

type Line = { kind: string; subject: string; detail: Record<string, string> }

afterAll(async () => {
  if (seed) {
    await seed.delete(cases)
    await seed.delete(customers)
  }
  await pool?.end()
  if (seedPool !== pool) await seedPool?.end()
})

describe.skipIf(!db)('giving a case its customer', () => {
  let controller: CaseCustomerController
  let written: Line[]
  let northwind: string
  let unattributed: string

  const caller = { user: { id: 'somebody' } } as never
  const request = { headers: {} } as never

  async function onboard(name: string): Promise<string> {
    const [made] = await seed!.insert(customers).values({ name }).returning({ id: customers.id })
    return made!.id
  }

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)

    await new CustomersService(db!).ensureDefault()
    northwind = await onboard('Northwind BV')

    const [made] = await seed!.insert(cases).values({ title: 'Nobody has said whose' }).returning()
    unattributed = made!.id

    written = []
    const audit = {
      caseAttributed: (
        _c: unknown,
        _caseId: string,
        subject: string,
        detail: Record<string, string>,
      ) => {
        written.push({ kind: 'case_attributed', subject, detail })
        return Promise.resolve()
      },
    }

    controller = new CaseCustomerController(new CasesService(db!), audit as never)
  })

  it('gives a case that named nobody its customer', async () => {
    const answer = await controller.attribute(
      unattributed,
      { customerId: northwind },
      caller,
      request,
    )

    const [row] = await seed!.select().from(cases).where(eq(cases.id, unattributed))
    expect(row!.customerId).toBe(northwind)
    expect(answer.from, 'the case named nobody, and the answer should say so').toBeNull()
  })

  /**
   * **Both records, because either one alone answers the wrong question.** An
   * auditor asking why an analyst stopped reaching a case needs the one it
   * left; one asking what a customer holds needs the one it arrived at.
   *
   * `null` rather than `'none'`: rendering an absent customer as a word is
   * `InstallActivityService.caseAttributed`'s, where `detail` is a record of
   * strings, and it is asserted against the stored row in
   * `test/a-case-moves-to-its-customer.test.ts`.
   */
  it('records the move against both customers', async () => {
    await controller.attribute(unattributed, { customerId: northwind }, caller, request)

    expect(written).toHaveLength(1)
    expect(written[0]!.subject, 'the line names no case a reader can identify').toBe(
      'Nobody has said whose',
    )
    expect(written[0]!.detail).toMatchObject({ from: null, to: northwind })
  })

  it('names the customer it left when the case had one', async () => {
    await controller.attribute(unattributed, { customerId: northwind }, caller, request)
    written = []

    const other = await onboard('Contoso NV')
    const answer = await controller.attribute(unattributed, { customerId: other }, caller, request)

    expect(answer.from).toBe(northwind)
    expect(written[0]!.detail).toMatchObject({ from: northwind, to: other })
  })

  /**
   * **404 rather than a foreign-key error surfacing as a 500.** The column is
   * a reference, so the database would refuse it -- as a driver error, which
   * tells an analyst the install is broken.
   */
  it('refuses a customer that does not exist', async () => {
    await expect(
      controller.attribute(
        unattributed,
        { customerId: '00000000-0000-4000-8000-000000000000' },
        caller,
        request,
      ),
    ).rejects.toMatchObject({ status: 404 })

    const [row] = await seed!.select().from(cases).where(eq(cases.id, unattributed))
    expect(row!.customerId, 'the case moved anyway').toBeNull()
    expect(written, 'a refused move was recorded as one that happened').toEqual([])
  })

  it('refuses a case that does not exist', async () => {
    await expect(
      controller.attribute(
        '00000000-0000-4000-8000-000000000000',
        { customerId: northwind },
        caller,
        request,
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  /**
   * **A move to where it already is leaves a line saying nothing moved**, and
   * an audit full of those is one nobody reads.
   */
  it('refuses a move to the customer it already answers for', async () => {
    await controller.attribute(unattributed, { customerId: northwind }, caller, request)
    written = []

    await expect(
      controller.attribute(unattributed, { customerId: northwind }, caller, request),
    ).rejects.toMatchObject({ status: 422 })
    expect(written).toEqual([])
  })

  /**
   * *A case moves to a customer that already uses its reference, and the move is
   * refused.* The second way into a state the merge already refuses from the
   * other side.
   */
  it('refuses a move that would collide on a reference', async () => {
    await seed!
      .insert(cases)
      .values({ title: 'Theirs already', customerId: northwind, reference: 'INC-2026-001' })
    const [mine] = await seed!
      .insert(cases)
      .values({ title: 'Mine', reference: 'INC-2026-001' })
      .returning()

    await expect(
      controller.attribute(mine!.id, { customerId: northwind }, caller, request),
    ).rejects.toMatchObject({ status: 409 })

    const [row] = await seed!.select().from(cases).where(eq(cases.id, mine!.id))
    expect(row!.customerId, 'the case moved into the collision anyway').toBeNull()
    expect(written, 'a refused move was recorded as one that happened').toEqual([])
  })

  it('refuses a move to the default customer', async () => {
    const theDefault = (await new CustomersService(db!).ensureDefault()).id
    await controller.attribute(unattributed, { customerId: northwind }, caller, request)
    written = []

    await expect(
      controller.attribute(unattributed, { customerId: theDefault }, caller, request),
    ).rejects.toMatchObject({ status: 409 })

    const [row] = await seed!.select().from(cases).where(eq(cases.id, unattributed))
    expect(row!.customerId, 'the case was un-attributed anyway').toBe(northwind)
    expect(written).toEqual([])
  })

  it('allows a move where neither case carries a reference', async () => {
    await seed!.insert(cases).values({ title: 'Theirs, unreferenced', customerId: northwind })

    await controller.attribute(unattributed, { customerId: northwind }, caller, request)

    const [row] = await seed!.select().from(cases).where(eq(cases.id, unattributed))
    expect(row!.customerId).toBe(northwind)
  })

  it('refuses a customerId that is not one', async () => {
    await expect(
      controller.attribute(unattributed, { customerId: 'northwind' }, caller, request),
    ).rejects.toThrow()
  })
})
