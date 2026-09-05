/**
 * **A case may answer for an organisation the system does not hold** - the
 * fourth requirement of `openspec/specs/customers`.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ComplianceService } from '../compliance/compliance.service.js'
import { InstallPreferencesService } from '../preferences/install.service.js'
import { cases, customers, user } from '../db/schema/index.js'
import { ORGANISATION_FACTS } from './organisation-facts.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'answering-analyst'

afterAll(async () => {
  if (seed) await seed.delete(cases)
  if (seed) await seed.delete(customers)
  await pool?.end()
})

describe.skipIf(!db)('a case answers for an organisation nobody holds', () => {
  let compliance: ComplianceService
  let customerId: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Answering Analyst',
        email: 'answering@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [customer] = await seed!
      .insert(customers)
      .values({
        name: 'Not yet attributed',
        isDefault: true,
        homeMemberState: null,
        competentAuthority: '',
      })
      .returning()
    customerId = customer!.id

    compliance = new ComplianceService(db!, new InstallPreferencesService(db!))
  })

  const aCase = async (title: string, against: string | null) => {
    const [row] = await seed!.insert(cases).values({ title, customerId: against }).returning()
    return row!.id
  }

  const answer = async (caseId: string, values: Record<string, unknown>) => {
    const before = (await compliance.read(caseId)) as unknown as { version: number }
    const result = await compliance.patch(caseId, before.version, values, ANALYST)
    expect(result.ok, `the answer was refused: ${JSON.stringify(result)}`).toBe(true)
  }

  /**
   * *An organisation is answered for on the case*: the case carries the
   * answers, and they are marked as its own.
   */
  it('marks an organisation fact answered on the case as the case\'s own', async () => {
    const caseId = await aCase('An organisation nobody holds', customerId)
    await compliance.read(caseId)

    await answer(caseId, { homeMemberState: 'IE', competentAuthority: 'NCSC-IE' })

    const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>
    expect(record['homeMemberState']).toBe('IE')
    expect(record['competentAuthority']).toBe('NCSC-IE')
    expect(await compliance.ownFacts(caseId)).toEqual(['homeMemberState', 'competentAuthority'])
  })

  /**
   * **The distinction the requirement turns on.**
   */
  it('owns nothing it merely copied from the customer', async () => {
    const [onboarded] = await seed!
      .insert(customers)
      .values({ name: 'Onboarded Ltd', homeMemberState: 'NL', dpoContact: 'dpo@onboarded.example' })
      .returning()
    const caseId = await aCase('A case against a real customer', onboarded!.id)

    const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>

    expect(record['homeMemberState'], 'the copy did not happen').toBe('NL')
    expect(await compliance.ownFacts(caseId)).toEqual([])
  })

  /** An incident's own facts are not the organisation's and are never owned. */
  it('does not mark an incident fact as an organisation answer', async () => {
    const caseId = await aCase('An incident fact', customerId)
    await compliance.read(caseId)

    await answer(caseId, { usersAffectedCount: 4200 })

    expect(await compliance.ownFacts(caseId)).toEqual([])
  })

  /**
   * *The organisation is onboarded afterwards*: the case's own answers are
   * kept, and where the customer's differ the case shows both rather than
   * taking one.
   */
  it('keeps its own answers when the organisation is onboarded and the case moves', async () => {
    const caseId = await aCase('Answered before onboarding', customerId)
    await compliance.read(caseId)
    await answer(caseId, { homeMemberState: 'IE', competentAuthority: 'NCSC-IE' })

    const [onboarded] = await seed!
      .insert(customers)
      .values({
        name: 'Onboarded Later Ltd',
        homeMemberState: 'IE',
        competentAuthority: 'An different authority',
      })
      .returning()
    await seed!.update(cases).set({ customerId: onboarded!.id }).where(eq(cases.id, caseId))

    const record = (await compliance.read(caseId)) as unknown as Record<string, unknown>

    // Kept, not overwritten by the customer it moved to.
    expect(record['competentAuthority']).toBe('NCSC-IE')
    expect(await compliance.ownFacts(caseId)).toContain('competentAuthority')

    // Both are visible: the case's own stands, and the disagreement is
    // reported for the analyst to settle rather than settled for them.
    expect(await compliance.moved(caseId)).toEqual(['competentAuthority'])
  })

  it('claims nothing when a whole-record save changes none of it', async () => {
    const caseId = await aCase('A whole-record save', customerId)
    const held = (await compliance.read(caseId)) as unknown as Record<string, unknown>

    // Every organisation fact, at the value the case already holds.
    await answer(
      caseId,
      Object.fromEntries(ORGANISATION_FACTS.map((name) => [name, held[name]])),
    )

    expect(await compliance.ownFacts(caseId)).toEqual([])
  })

  /** And the one fact in that save that did move is the only one claimed. */
  it('claims only the fact a whole-record save moved', async () => {
    const caseId = await aCase('One moved among many', customerId)
    const held = (await compliance.read(caseId)) as unknown as Record<string, unknown>

    await answer(caseId, {
      ...Object.fromEntries(ORGANISATION_FACTS.map((name) => [name, held[name]])),
      competentAuthority: 'A different authority',
    })

    expect(await compliance.ownFacts(caseId)).toEqual(['competentAuthority'])
  })

  /**
   * **Answering the same fact again does not list it twice.**
   */
  it('records a fact answered twice once', async () => {
    const caseId = await aCase('Answered twice', customerId)
    await compliance.read(caseId)

    await answer(caseId, { homeMemberState: 'IE' })
    await answer(caseId, { homeMemberState: 'BE' })

    expect(await compliance.ownFacts(caseId)).toEqual(['homeMemberState'])
  })
})
