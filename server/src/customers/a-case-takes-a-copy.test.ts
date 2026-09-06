/**
 * **A case takes a copy of the organisation's facts, and is told when the
 * original moves** - the third requirement of `openspec/specs/customers`.
 *
 * The three scenarios it carries are the three cases here: correcting a
 * customer changes no case, every case carrying a value that has moved shows
 * that it has, and a closed case is left alone.
 *
 * **The subjects come from the intersection of the two tables**, not from a
 * list written here, so a fact added to `customers` beside a column the case
 * already has is swept without anyone editing this file.
 */
import { eq, getTableColumns } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ComplianceService } from '../compliance/compliance.service.js'
import { InstallPreferencesService } from '../preferences/install.service.js'
import { ORGANISATION_FACTS } from './organisation-facts.js'
import { caseCompliance, cases, customers, user } from '../db/schema/index.js'
import { rowVersioning } from '../db/schema/columns.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

afterAll(async () => {
  if (seed) await seed.delete(cases)
  if (seed) await seed.delete(customers)
  await pool?.end()
})

const ACCEPTING_ANALYST = 'accepting-analyst'

describe.skipIf(!db)('a case takes a copy of the organisation facts', () => {
  let compliance: ComplianceService
  let customerId: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)

    const [customer] = await seed!
      .insert(customers)
      .values({
        name: 'Northwind Logistics',
        homeMemberState: 'NL',
        competentAuthority: 'Rijksinspectie Digitale Infrastructuur',
        dpoContact: 'dpo@northwind.example',
        usersTotalCount: 40_000,
      })
      .returning()
    customerId = customer!.id

    // The analyst who accepts a correction. `updated_by` is a foreign key, so
    // a write attributed to somebody the install does not hold is refused --
    // correctly, and it fails the fixture rather than the subject.
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ACCEPTING_ANALYST,
        name: 'Accepting Analyst',
        email: 'accepting@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    compliance = new ComplianceService(db!, new InstallPreferencesService(db!))
  })

  const aCase = async (title: string, against: string | null = customerId) => {
    const [row] = await seed!.insert(cases).values({ title, customerId: against }).returning()
    return row!.id
  }

  /**
   * **Every customer column is in the set unless it is named out of it**, so a
   * column that silently leaves the intersection is a failure rather than a
   * smaller set.
   *
   * A count would not do it. The set has nine members; `length > 4` stays true
   * when a rename on one table only drops a column out of the intersection,
   * and the suite goes on passing while a fact quietly stops being copied.
   * That is the hazard the derivation buys with never writing the list down,
   * and this is the price of it: an exclusion has to be argued here.
   *
   * The assertion still holds no list of what *is* included - it names only
   * what is deliberately out, so a column added to `customers` and to the case
   * is swept without anybody editing this file.
   */
  it('carries every organisation fact except the ones named out of it', () => {
    const held = Object.keys(getTableColumns(customers))
    const bookkeeping = new Set(['id', ...Object.keys(rowVersioning)])

    const excluded = new Set([
      // The record's own identity rather than a fact about the organisation.
      'name',
      'isDefault',
      'regimes',
    ])

    const expected = held.filter((name) => !bookkeeping.has(name) && !excluded.has(name))

    expect([...ORGANISATION_FACTS].sort()).toEqual(expected.sort())
  })

  it('answers an organisation fact from the customer, without being asked twice', async () => {
    const caseId = await aCase('A case that inherits')

    const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>

    expect(record['homeMemberState']).toBe('NL')
    expect(record['dpoContact']).toBe('dpo@northwind.example')
    expect(record['usersTotalCount']).toBe(40_000)
  })

  it('leaves a case with no customer to answer for itself', async () => {
    const caseId = await aCase('A case answering for an organisation nobody holds', null)

    const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>

    expect(record['homeMemberState']).toBeNull()
    expect(await compliance.moved(caseId)).toEqual([])
  })

  it('shows nothing moved while the copy is current', async () => {
    const caseId = await aCase('A case in step')
    await compliance.read(caseId)

    expect(await compliance.moved(caseId)).toEqual([])
  })

  /** *A customer's details are corrected*: no case changes on its own. */
  it('changes no case when the customer is corrected, and says which moved', async () => {
    const first = await aCase('One case')
    const second = await aCase('Another case')
    await compliance.read(first)
    await compliance.read(second)

    await seed!
      .update(customers)
      .set({ competentAuthority: 'Autoriteit Persoonsgegevens' })
      .where(eq(customers.id, customerId))

    for (const caseId of [first, second]) {
      const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>
      expect(record['competentAuthority'], 'a correction rewrote a case').toBe(
        'Rijksinspectie Digitale Infrastructuur',
      )
      expect(await compliance.moved(caseId)).toEqual(['competentAuthority'])
    }
  })

  /**
   * *An analyst accepts a correction*: taking the new value is an ordinary
   * write, and afterwards the case no longer reports it as moved.
   */
  it('stops reporting a fact as moved once the analyst takes it', async () => {
    const caseId = await aCase('A case that accepts')
    const before = await compliance.read(caseId)
    await seed!
      .update(customers)
      .set({ dpoContact: 'privacy@northwind.example' })
      .where(eq(customers.id, customerId))
    expect(await compliance.moved(caseId)).toEqual(['dpoContact'])

    await compliance.patch(
      caseId,
      (before as unknown as { version: number }).version,
      { dpoContact: 'privacy@northwind.example' },
      ACCEPTING_ANALYST,
    )

    expect(await compliance.moved(caseId)).toEqual([])

    /**
     * **The scenario's second clause: *"the change is attributed like any
     * other."*** Nothing else here asserts the actor, so without this a write
     * path that drops it -- or writes somebody else's -- leaves the case green
     * while the case's own record says an unknown hand made the change.
     */
    const [row] = await seed!
      .select({ updatedBy: caseCompliance.updatedBy })
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, caseId))
    expect(row, 'the compliance row this case just wrote').toBeDefined()
    expect(row!.updatedBy, 'taking a correction is a change like any other').toBe(ACCEPTING_ANALYST)
  })

  /**
   * *A closed case is left alone.* Asserted on the record rather than on a
   * refusal: nothing in this path writes, so what protects a closed case is
   * that a correction has no route to it at all.
   */
  it('leaves a closed case carrying what it reported', async () => {
    const caseId = await aCase('A case already sent')
    await compliance.read(caseId)
    await seed!
      .update(cases)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(cases.id, caseId))

    await seed!
      .update(customers)
      .set({ homeMemberState: 'BE', competentAuthority: 'CCB' })
      .where(eq(customers.id, customerId))

    const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>
    expect(record['homeMemberState']).toBe('NL')
    expect(record['competentAuthority']).toBe('Rijksinspectie Digitale Infrastructuur')

    expect((await compliance.moved(caseId)).sort()).toEqual([
      'competentAuthority',
      'homeMemberState',
    ])
  })
})
