/**
 * The state a case carries, and what it tells somebody who has not opened it.
 *
 * **The question the state answers is where the work is**: whether the SOC is
 * still handling a live incident, or whether the incident is over and what
 * remains is the write-up. Two values could not say that -- `open` covered
 * both -- so the distinction the requirement exists for was not representable.
 * -> #221
 *
 * **What this does not cover: the gate on closing.** A case must not be
 * closable while reporting or lessons it owes are outstanding, and what a case
 * owes is recorded nowhere yet, so the gate has no subject to read. Those two
 * scenarios stay unbuilt and are named as such in the ledger. -> #188
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CasesService } from './cases.service.js'
import { LIVE_STATES, caseStatusSchema } from '../domain/case.js'
import { cases, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe('the states a case can be in', () => {
  it('names the four the specification names, and no others', () => {
    expect(caseStatusSchema.options).toEqual(['respond', 'recover', 'post_incident', 'closed'])
  })

  /**
   * **Live is stated, never derived.** Every reader that wants "is the incident
   * still going" would otherwise ask `!== 'closed'`, which counts a case in
   * write-up as a live incident -- the exact thing the state exists to tell
   * apart.
   */
  it('says which of them mean the incident is still live', () => {
    expect([...LIVE_STATES]).toEqual(['respond', 'recover'])
    expect(LIVE_STATES, 'write-up is not a live incident').not.toContain('post_incident')
    expect(LIVE_STATES).not.toContain('closed')
  })
})

describe.skipIf(!db)('a case moving between states', () => {
  let service: CasesService
  let actorId: string
  let minted = 0

  beforeAll(async () => {
    actorId = 'state-analyst'
    // The case row names its author as a foreign key, so the analyst exists first.
    const now = new Date()
    await seed!
      .insert(user)
      .values({ id: actorId, name: 'State Analyst', email: 'state@example.test', emailVerified: true, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
    service = new CasesService(
      db!,
      { announce: () => {}, othersOn: () => Promise.resolve([]) } as never,
    )
  })

  afterAll(async () => {
    await seed!.delete(cases)
  })

  async function raised() {
    minted += 1
    return service.create(
      { title: 'Where the work sits', reference: `INC-221-${String(minted)}`, customer: 'Acme' },
      actorId,
    )
  }

  /** A case is raised while the incident is live, which is the first state. */
  it('starts in respond', async () => {
    const row = await raised()

    expect(row.status).toBe('respond')
  })

  /** The written row, or a failure naming the refusal rather than `ok: false`. */
  async function moveTo(id: string, version: number, status: string) {
    const result = await service.patch(id, version, { status }, actorId)
    if (!result.ok) throw new Error(`the write was refused at version ${String(version)}`)
    return result.row
  }

  /**
   * The incident ends before the case does: the analyst records that, and the
   * case is neither live nor closed.
   */
  it('moves to post-incident without being closed', async () => {
    const row = await raised()

    const moved = await moveTo(row.id, row.version, 'post_incident')

    expect(moved.status).toBe('post_incident')
    expect(LIVE_STATES, 'a case in write-up still counts as a live incident').not.toContain(
      moved.status,
    )
    const [stored] = await seed!.select().from(cases).where(eq(cases.id, row.id))
    expect(stored!.closedAt, 'moving to write-up recorded a conclusion').toBeNull()
  })

  /**
   * **A handled incident resumes, and that is ordinary.** The state is a
   * marker rather than a gate, so nothing may refuse the way back.
   */
  it('returns to respond from post-incident', async () => {
    const row = await raised()
    const moved = await moveTo(row.id, row.version, 'post_incident')

    const back = await moveTo(row.id, moved.version, 'respond')

    expect(back.status).toBe('respond')
  })

  /** And it may close from any state, without passing through write-up. */
  it('closes from respond, without passing through post-incident', async () => {
    const row = await raised()

    const shut = await moveTo(row.id, row.version, 'closed')

    expect(shut.status).toBe('closed')
  })
})
