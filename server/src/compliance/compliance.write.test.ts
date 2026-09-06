/**
 * Reading and writing the regulatory record, attacked rather than
 * demonstrated. The record's version is the thing under test: it is a second
 * versioned row inside a case, and the conflict case is what proves the guard
 * is on *this* row rather than on the case.
 *
 * A plain successful write is a claim too - `case_compliance` has no `id`
 * column, so `updateVersioned` reaches it through `keyColumn`, and a scope
 * built from a missing column is a syntax error rather than a missed row.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { NotFoundException } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from '../cases/cases.service.js'
import { ComplianceController } from './compliance.controller.js'
import { ComplianceService } from './compliance.service.js'
import { caseCompliance, cases, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('the case compliance record', () => {
  let controller: ComplianceController
  let cases_: CasesService
  let session: { user: { id: string } }
  let announced: { caseId: string; scopes: string[] }[]

  async function freshCase(): Promise<string> {
    const row = await cases_.create({ title: 'Compliance under test' }, session.user.id)
    return row.id
  }

  beforeAll(async () => {
    const actorId = 'compliance-analyst'
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Compliance Analyst',
        email: 'compliance@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    session = { user: { id: actorId } }

    announced = []
    const channel = {
      announce: (caseId: string, scopes: string[]) => announced.push({ caseId, scopes }),
      othersOn: () => Promise.resolve([]),
    } as never
    cases_ = new CasesService(db!, channel)
    // The install settings are read for the verdict route only; the record's
    // own read and write never consult them.
    const settings = { all: () => Promise.resolve({}) } as never
    controller = new ComplianceController(new ComplianceService(db!, settings, channel))
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  /**
   * A case that is not there is Not Found, not a server error - the record is
   * raised on first read, so the insert's foreign key fails before any check
   * for the case can be reached.
   */
  it('answers Not Found for a case that does not exist, rather than throwing', async () => {
    const nowhere = '00000000-0000-4000-8000-000000000000'
    await expect(controller.read(nowhere)).rejects.toThrow(NotFoundException)
  })

  it('answers Not Found for a verdict on a case that does not exist', async () => {
    const nowhere = '00000000-0000-4000-8000-000000000000'
    await expect(controller.verdict(nowhere)).rejects.toThrow(NotFoundException)
  })

  it('raises the record on first read, whichever way the case was created', async () => {
    // **Not at case creation.** Inserting it beside the case's own insert
    // passes every unit test and leaves a case raised by any other path -- the
    // seeder's, for one -- showing Not Found. An invariant each creator has to
    // remember is one the next creator will not.
    const id = await freshCase()
    const row = await controller.read(id)
    expect(row.caseId).toBe(id)
    expect(row.version).toBe(1)
    expect(row.nis2Death).toBeNull()
  })

  it('writes a ground and hands back the version the next write has to name', async () => {
    const id = await freshCase()
    const written = await controller.read(id)

    const after = await controller.patch(
      id,
      { version: written.version, nis2Death: 'no' },
      session as never,
    )

    expect(after.nis2Death).toBe('no')
    expect(after.version).toBe(written.version + 1)
    const [stored] = await seed!
      .select()
      .from(caseCompliance)
      .where(eq(caseCompliance.caseId, id))
    expect(stored!.nis2Death).toBe('no')
    expect(stored!.updatedBy).toBe(session.user.id)
  })

  it('stores a set as a set rather than as the string a control shows', async () => {
    const id = await freshCase()
    const { version } = await controller.read(id)

    const after = await controller.patch(
      id,
      { version, affectedMemberStates: ['AT', 'BE'] },
      session as never,
    )

    expect(after.affectedMemberStates).toEqual(['AT', 'BE'])
  })

  it('refuses a second write that names the version the first consumed', async () => {
    // The whole reason this row is not written through the case PATCH: two
    // analysts on different cards must collide here, and only here.
    const id = await freshCase()
    const { version } = await controller.read(id)
    await controller.patch(id, { version, nis2Death: 'no' }, session as never)

    await expect(
      controller.patch(id, { version, nis2HealthDamage: 'yes' }, session as never),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a patch that names no version at all', async () => {
    const id = await freshCase()
    await expect(
      controller.patch(id, { nis2Death: 'no' }, session as never),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a field the record does not have, rather than dropping it', async () => {
    // Silently ignoring it is the failure: the screen shows the value it typed
    // and the column keeps whatever it held.
    const id = await freshCase()
    const { version } = await controller.read(id)

    await expect(
      controller.patch(id, { version, version_: 9, isDemo: true }, session as never),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a value outside the vocabulary the regulation closes', async () => {
    const id = await freshCase()
    const { version } = await controller.read(id)

    await expect(
      controller.patch(id, { version, nis2EntityClass: 'quite important' }, session as never),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('does not rewrite the siblings that carry a default', async () => {
    // `.partial()` keeps a `.default()` intact, so a one-field patch would
    // blank every answered question on the next blur. `patchSchema` is what
    // stops it, and this is the assertion that says so.
    const id = await freshCase()
    const first = await controller.read(id)
    const set = await controller.patch(
      id,
      { version: first.version, nis2Death: 'yes', affectedMemberStates: ['NL'] },
      session as never,
    )

    const after = await controller.patch(
      id,
      { version: set.version, competentAuthority: 'AP' },
      session as never,
    )

    expect(after.nis2Death).toBe('yes')
    expect(after.affectedMemberStates).toEqual(['NL'])
  })

  it('announces the record rather than the case, so the open form repaints', async () => {
    const id = await freshCase()
    const { version } = await controller.read(id)
    announced.length = 0

    await controller.patch(id, { version, nis2Death: 'no' }, session as never)

    expect(announced).toEqual([{ caseId: id, scopes: ['case_compliance'] }])
  })
})
