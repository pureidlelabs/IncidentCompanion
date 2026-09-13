/**
 * *Where a case carries a reference it MUST be unique within its customer.*
 *
 * **Attacked at the pair the obvious index would miss.** A case with no
 * customer resolves to the default only when it is read, so two of them share
 * no `customer_id` value -- and Postgres treats NULLs as distinct, which means
 * `unique (customer_id, reference)` admits exactly the collision this
 * requirement forbids. The measurement on #220 is two cases with
 * `"customer":null` and one reference, so that pair leads here.
 *
 * **The two permissive halves are asserted too, and they are the ones that go
 * quiet.** *The same reference for two customers* and *several cases with no
 * reference* both pass on an install with no rule at all, so on their own they
 * would certify the absence of the behaviour the rest of the file needs. They
 * are here to stop the fix over-reaching, which is the failure a uniqueness
 * rule actually tends to have: refusing the second case that is waiting for a
 * reference, because `('', '')` equals `('', '')`.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CasesService } from './cases.service.js'
import { openTestPool } from '../../test/database.js'
import { cases, customers, user } from '../db/schema/index.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'reference-unique-analyst'

describe.skipIf(!db)('a reference within its customer', () => {
  let service: CasesService
  let fallback: string
  let acme: string
  let other: string

  beforeAll(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Reference Analyst',
        email: `${ANALYST}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    service = new CasesService(db!, {
      announce: () => undefined,
      othersOn: () => Promise.resolve([]),
    } as never)
  })

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)
    /**
     * **The install always holds a default customer**, ensured on every boot by
     * `CustomersModule`. A case is opened under it, so a fixture without one is
     * an install this product does not have.
     */
    const [made] = await seed!
      .insert(customers)
      .values({ name: 'Unattributed', isDefault: true })
      .returning()
    fallback = made!.id
    const [one] = await seed!.insert(customers).values({ name: 'Acme NV' }).returning()
    const [two] = await seed!.insert(customers).values({ name: 'Other NV' }).returning()
    acme = one!.id
    other = two!.id
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)
    await seed!.delete(user).where(eq(user.id, ANALYST))
    await pool?.end()
  })

  const make = (fields: { title: string; reference?: string; customer?: string }) =>
    service.create(fields, ANALYST)

  /**
   * The measurement on the issue, which is the case a bare
   * `unique (customer_id, reference)` would still allow.
   */
  it('refuses a second case with that reference and no customer named', async () => {
    await make({ title: 'First case', reference: 'TICKET-1' })

    await expect(
      make({ title: 'Second case', reference: 'TICKET-1' }),
      'two customer-less cases took one reference',
    ).rejects.toThrow(/already carries TICKET-1/)
  })

  it('refuses a second case with that reference for one customer', async () => {
    await make({ title: 'First for Acme', reference: 'TICKET-2' })

    await expect(
      make({ title: 'Second for Acme', reference: 'TICKET-2' }),
      'one customer took one reference twice',
    ).rejects.toThrow(/already carries TICKET-2/)
  })

  /** *The analyst is told which case already holds it*, not merely refused. */
  it('names the case already holding it', async () => {
    await make({ title: 'The original', reference: 'TICKET-3' })

    await expect(
      make({ title: 'The duplicate', reference: 'TICKET-3' }),
    ).rejects.toThrow(/The original/)
  })

  /**
   * **Arranged by insert rather than through `create`, because `create`
   * cannot reach `customer_id`.** It takes `customer` -- the free-text column
   * being retired -- and spreads it, so every case it makes carries a null
   * `customer_id` and belongs to the default customer. This scenario is
   * therefore unreachable through the write path today, which is #218's gap
   * rather than this rule's; asserted against the table so the rule is known
   * to be per-customer and not global the day a case can name one.
   */
  it('allows one reference across two customers, driven through the write path', async () => {
    // **Through `create` and `attribute`, not two inserts.** A fixture that
    // states both `customer_id`s itself certifies a boundary the shipping path
    // never reaches -- which is how this rule was believed covered while the
    // door that introduces collisions checked nothing.
    const first = await make({ title: 'Acme side', reference: 'TICKET-4' })
    await service.attribute(first.id, acme, ANALYST)

    const second = await make({ title: 'Other side', reference: 'TICKET-4' })
    await service.attribute(second.id, other, ANALYST)

    const rows = await seed!.select().from(cases).orderBy(cases.title)
    expect(
      rows.map((one) => [one.title, one.customerId]),
      'one ticket number for two customers was refused, or landed in one group',
    ).toEqual([
      ['Acme side', acme],
      ['Other side', other],
    ])
  })

  /**
   * **A case is opened under the install's default customer**, which the
   * schema said of itself and nothing made true: `create` wrote the free-text
   * column and left the foreign key null, so every case resolved to the
   * default only when it was read and the index could not tell two customers
   * apart.
   */
  it('opens a case under the default customer', async () => {
    const made = await make({ title: 'Unattributed' })

    expect(made.customerId, 'a created case carries no customer').toBe(fallback)
  })

  /**
   * **The absence of a reference is not a value and never collides.** Asserted
   * for both spellings the column can hold, because the write path defaults an
   * omitted reference and an analyst can clear one to empty.
   */
  it.each([
    ['omitted', undefined],
    ['empty', ''],
  ])('allows any number of cases whose reference is %s', async (_why, reference) => {
    const fields = reference === undefined ? {} : { reference }
    await make({ title: 'Waiting one', ...fields })
    await make({ title: 'Waiting two', ...fields })
    const rows = await seed!.select().from(cases)

    expect(rows, 'a case waiting for its reference collided with another').toHaveLength(2)
  })

  /**
   * The index is what makes the service's check unbypassable, so it is
   * asserted directly: a writer that skipped the lookup would otherwise pass
   * every case above once the lookup was the only guard.
   */
  it('is refused by the database even when the service is bypassed', async () => {
    const [first] = await seed!
      .insert(cases)
      .values({ title: 'Straight to the table', reference: 'TICKET-5', customerId: acme })
      .returning()
    expect(first!.reference).toBe('TICKET-5')

    // **Asserted on the cause, not the message.** Drizzle rewrites a driver
    // error to `Failed query: ...`, so matching the index name on the outer
    // error fails on a correctly refused insert -- and would have passed on any
    // other error just as readily.
    const refused = await seed!
      .insert(cases)
      .values({ title: 'Also straight in', reference: 'TICKET-5', customerId: acme })
      .catch((why: unknown) => why)
    expect(refused, 'the table accepted a duplicate reference').toBeInstanceOf(Error)
    expect(String((refused as { cause?: unknown }).cause)).toMatch(
      /cases_customer_reference_idx/,
    )
  })
})
