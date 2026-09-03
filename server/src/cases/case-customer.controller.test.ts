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

import { CaseCustomerController } from './case-customer.controller.js'
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

  /** A customer, inserted rather than created: no route makes one yet. */
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

  it('refuses a customerId that is not one', async () => {
    await expect(
      controller.attribute(unattributed, { customerId: 'northwind' }, caller, request),
    ).rejects.toThrow()
  })
})
