/**
 * **A customer cannot be removed out from under its cases** - the fifth
 * requirement of `openspec/specs/customers`, and the five of its seven
 * scenarios that do not turn on reach.
 *
 * Duplicates are how customer records actually go wrong, and moving cases one
 * at a time invites the analyst to miss some - so the answer the specification
 * asks for is a merge rather than a bulk edit.
 *
 * **The two scenarios not here are `Reach after a merge` and `An analyst
 * reaches both sides of a merge at different levels`.** Both turn on what a
 * grant survives, which is group membership rather than anything a customer
 * record holds, and `a-merge-moves-the-reach.test.ts` is where they are
 * demonstrated.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CustomersService } from './customers.service.js'
import { MERGE_FACTS, ORGANISATION_FACTS } from './organisation-facts.js'
import { ComplianceService } from '../compliance/compliance.service.js'
import { InstallPreferencesService } from '../preferences/install.service.js'
import { cases, customers, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const ANALYST = 'merging-analyst'

/**
 * The one fact the two records answer differently, settled the way an analyst
 * would settle it.
 *
 * Named once so a case that is *not* about the disagreement does not read as
 * though the choice were part of what it asserts.
 */
const SETTLED = { competentAuthority: 'AP' }

afterAll(async () => {
  if (seed) await seed.delete(cases)
  if (seed) await seed.delete(customers)
  await pool?.end()
})

describe.skipIf(!db)('two customer records that are one organisation', () => {
  let service: CustomersService
  let compliance: ComplianceService
  let losing: string
  let surviving: string
  let theDefault: string

  beforeEach(async () => {
    await seed!.delete(cases)
    await seed!.delete(customers)

    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ANALYST,
        name: 'Merging Analyst',
        email: 'merging@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    service = new CustomersService(db!)
    compliance = new ComplianceService(db!, new InstallPreferencesService(db!))
    theDefault = (await service.ensureDefault()).id

    const [a] = await seed!
      .insert(customers)
      .values({ name: 'Northwind BV', homeMemberState: 'NL', competentAuthority: 'RDI' })
      .returning()
    const [b] = await seed!
      .insert(customers)
      .values({ name: 'Northwind B.V.', homeMemberState: 'NL', competentAuthority: 'AP' })
      .returning()
    losing = a!.id
    surviving = b!.id
  })

  const aCase = async (title: string, against: string, reference?: string) => {
    const [row] = await seed!
      .insert(cases)
      .values({ title, customerId: against, ...(reference ? { reference } : {}) })
      .returning()
    return row!.id
  }

  const customerOf = async (caseId: string) => {
    const [row] = await seed!
      .select({ customerId: cases.customerId })
      .from(cases)
      .where(eq(cases.id, caseId))
    return row!.customerId
  }

  /** *A customer with cases is removed.* */
  it('refuses to remove a customer with cases, and says how many stand in the way', async () => {
    await aCase('One', losing)
    await aCase('Two', losing)
    await aCase('Three', losing)

    await expect(service.remove(losing)).rejects.toMatchObject({
      response: { message: expect.stringContaining('3') },
    })

    const [still] = await seed!.select().from(customers).where(eq(customers.id, losing))
    expect(still, 'the customer was removed anyway').toBeDefined()
  })

  it('removes a customer nothing stands behind', async () => {
    await service.remove(losing)

    const [gone] = await seed!.select().from(customers).where(eq(customers.id, losing))
    expect(gone).toBeUndefined()
  })

  /** *Two customer records turn out to be one organisation.* */
  it('moves every case to the survivor, and attributes the merge', async () => {
    const first = await aCase('One', losing)
    const second = await aCase('Two', losing)
    const untouched = await aCase('Theirs already', surviving)

    await service.merge({ losing, surviving, choices: SETTLED, actorId: ANALYST })

    for (const caseId of [first, second, untouched]) {
      expect(await customerOf(caseId)).toBe(surviving)
    }
    const [gone] = await seed!.select().from(customers).where(eq(customers.id, losing))
    expect(gone, 'the losing record outlived the merge').toBeUndefined()

    const [survivor] = await seed!.select().from(customers).where(eq(customers.id, surviving))
    expect(survivor!.updatedBy).toBe(ANALYST)
  })

  it('leaves every value a case had already copied', async () => {
    const caseId = await aCase('Already copied', losing)
    const before = (await compliance.read(caseId)) as unknown as Record<string, unknown>
    expect(before['competentAuthority'], 'the copy did not happen').toBe('RDI')

    await service.merge({ losing, surviving, choices: SETTLED, actorId: ANALYST })

    const after = (await compliance.read(caseId)) as unknown as Record<string, unknown>
    expect(after['competentAuthority'], 'the merge rewrote a case').toBe('RDI')
  })

  /**
   * *The merged records disagree*: the analyst chooses, and **the system does
   * not choose for them** - so a merge that leaves a disagreement unanswered
   * is refused rather than quietly keeping the survivor's answer, which would
   * be the system choosing.
   */
  it('refuses a merge that leaves a disagreement unanswered, naming the fact', async () => {
    await expect(
      service.merge({ losing, surviving, choices: {}, actorId: ANALYST }),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining('competentAuthority') },
    })

    const [both] = await seed!.select().from(customers).where(eq(customers.id, losing))
    expect(both, 'a refused merge removed the losing record anyway').toBeDefined()
  })

  it('takes the answer the analyst chose for a fact the two disagree on', async () => {
    await service.merge({
      losing,
      surviving,
      choices: { competentAuthority: 'RDI' },
      actorId: ANALYST,
    })

    const [survivor] = await seed!.select().from(customers).where(eq(customers.id, surviving))
    expect(survivor!.competentAuthority).toBe('RDI')
  })

  it('refuses an answer neither record holds', async () => {
    await expect(
      service.merge({
        losing,
        surviving,
        choices: { competentAuthority: 'Neither of them' },
        actorId: ANALYST,
      }),
    ).rejects.toMatchObject({ status: 422 })

    const [survivor] = await seed!.select().from(customers).where(eq(customers.id, surviving))
    expect(survivor!.competentAuthority, 'the merge wrote it anyway').toBe('AP')
    const [still] = await seed!.select().from(customers).where(eq(customers.id, losing))
    expect(still, 'a refused merge removed the losing record anyway').toBeDefined()
  })

  /**
   * **A refusal rather than a 23502 surfacing as a 500.**
   * `competentAuthority` is `NOT NULL DEFAULT ''`, and nothing in this tree
   * maps a Postgres error code to a status.
   */
  it('refuses a null where the column takes none', async () => {
    await expect(
      service.merge({
        losing,
        surviving,
        choices: { competentAuthority: null },
        actorId: ANALYST,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('writes the value that record holds when the choice names the blank side', async () => {
    const [blank] = await seed!
      .insert(customers)
      .values({ name: 'Never asked BV', homeMemberState: 'NL', competentAuthority: '' })
      .returning()

    await service.merge({
      losing: blank!.id,
      surviving,
      choices: { competentAuthority: null },
      actorId: ANALYST,
    })

    const [survivor] = await seed!.select().from(customers).where(eq(customers.id, surviving))
    expect(survivor!.competentAuthority, 'a null reached the column').toBe('')
  })

  /**
   * **A choice for a fact nobody disagreed about is an edit wearing a merge's
   * clothes.** Accepting it would let a merge change an answer neither record
   * held, with no review and the merge's attribution on it.
   *
   * The required choice is supplied too, so the refusal can only be about the
   * spurious one.
   */
  it('refuses a choice for a fact the two do not disagree on', async () => {
    await expect(
      service.merge({
        losing,
        surviving,
        choices: { ...SETTLED, homeMemberState: 'BE' },
        actorId: ANALYST,
      }),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('homeMemberState') } })
  })

  /** *A reference collides across the merge.* */
  it('refuses a merge whose cases collide on a reference, naming both', async () => {
    const mine = await aCase('Mine', losing, 'INC-2026-001')
    const theirs = await aCase('Theirs', surviving, 'INC-2026-001')

    // *the analyst is told which two cases collide* - a reference alone leaves
    // them to go and find both.
    await expect(
      service.merge({ losing, surviving, choices: SETTLED, actorId: ANALYST }),
    ).rejects.toMatchObject({
      response: {
        message: expect.stringMatching(/Mine.*Theirs.*INC-2026-001|Theirs.*Mine.*INC-2026-001/s),
      },
    })

    expect(await customerOf(mine), 'a refused merge moved a case anyway').toBe(losing)
    expect(await customerOf(theirs)).toBe(surviving)
  })

  /**
   * **`regimes` is disputable even though a case never copies it.**
   *
   * The copy set excludes it on purpose - it decides which questions a case is
   * asked rather than answering one - so a merge that reused the copy set
   * would resolve two records answering it differently to the survivor's,
   * silently. That is the one thing the merge swears it never does, and
   * settling it deliberately would be refused as well, because a choice for a
   * fact outside the dispute set reads as an edit: one set serving both
   * purposes leaves no way to do the right thing.
   */
  it('disputes a regimes disagreement rather than keeping the survivor quietly', async () => {
    await seed!.update(customers).set({ regimes: ['nis2'] }).where(eq(customers.id, losing))
    await seed!.update(customers).set({ regimes: ['gdpr'] }).where(eq(customers.id, surviving))

    await expect(
      service.merge({ losing, surviving, choices: SETTLED, actorId: ANALYST }),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('regimes') } })
  })

  it('takes the regimes the analyst chose', async () => {
    await seed!.update(customers).set({ regimes: ['nis2'] }).where(eq(customers.id, losing))
    await seed!.update(customers).set({ regimes: ['gdpr'] }).where(eq(customers.id, surviving))

    await service.merge({
      losing,
      surviving,
      choices: { ...SETTLED, regimes: ['nis2'] },
      actorId: ANALYST,
    })

    const [survivor] = await seed!.select().from(customers).where(eq(customers.id, surviving))
    expect(survivor!.regimes).toEqual(['nis2'])
  })

  /**
   * **Every fact a case can copy is a fact a merge can dispute**, which is the
   * relation between the two sets and the one that stops them drifting apart
   * again. A fact added to the copy set and not to the dispute set would be
   * copied onto cases and then silently resolved on a merge.
   */
  it('disputes at least everything a case copies', () => {
    for (const fact of ORGANISATION_FACTS) {
      expect(MERGE_FACTS, `${fact} is copied to a case but not disputable`).toContain(fact)
    }
    expect(MERGE_FACTS).toContain('regimes')
  })

  /** *The default customer is merged.* */
  it('refuses to merge the default away', async () => {
    await expect(
      service.merge({ losing: theDefault, surviving, choices: {}, actorId: ANALYST }),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('default') } })
  })

  it('refuses to merge another customer into the default', async () => {
    await expect(
      service.merge({ losing, surviving: theDefault, choices: {}, actorId: ANALYST }),
    ).rejects.toMatchObject({ response: { message: expect.stringContaining('default') } })
  })

  it('refuses to remove the default, whatever stands behind it', async () => {
    await expect(service.remove(theDefault)).rejects.toMatchObject({
      response: { message: expect.stringContaining('default') },
    })
  })
})
