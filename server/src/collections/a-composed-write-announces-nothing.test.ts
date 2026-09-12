/**
 * Which writes tell the open screens, and which must not.
 *
 * A write that opened its own transaction has committed by the time it returns,
 * so it announces. A write composed into a caller's transaction has not:
 * `withCase` returning is a released savepoint, and the act around it may still
 * roll back. `case-channel.service.ts` states the contract the second case
 * would break -- *the write has already committed* -- and nothing else holds a
 * caller to it.
 *
 * **Both directions, because either alone passes for the wrong reason.** A test
 * that only checked the silence would pass against a service that announced
 * nothing at all, which would leave every open screen stale on every write.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ordered } from './entities.controller.js'
import { TABLES } from './registry.js'
import { cases, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null
const SEED_URL = process.env.SEED_DATABASE_URL ?? ''
const seedPool = SEED_URL ? openTestPool(SEED_URL, 'ic_seed') : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

const announced: { caseId: string; scopes: readonly string[] }[] = []

const channel = {
  announce: (caseId: string, scopes: readonly string[]) => {
    announced.push({ caseId, scopes })
  },
  othersOn: () => Promise.resolve([]),
}

afterAll(async () => {
  await pool?.end()
  await seedPool?.end()
})

describe.skipIf(!db)('what a write tells the screens that are open', () => {
  const actorId = 'announce-analyst'
  let service: CollectionService
  let caseId = ''

  beforeAll(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: actorId,
        name: 'Announce Analyst',
        email: 'announce@example.test',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    service = new CollectionService(db!, channel as never)
  })

  beforeEach(async () => {
    announced.length = 0
    const [made] = await seed!.insert(cases).values({ title: 'Announcing' }).returning()
    caseId = made!.id
  })

  afterAll(async () => {
    if (caseId) await seed!.delete(cases).where(eq(cases.id, caseId))
  })

  const systems = () => ordered('systems', TABLES['systems'])

  it('tells them, where it opened the transaction itself', async () => {
    await service.createMany(systems(), caseId, [{ hostname: 'ANNOUNCED' }], actorId)

    expect(
      announced.map((one) => one.scopes),
      'a write that has committed told nobody, so every screen open on the case is stale ' +
        'until something else refetches',
    ).toEqual([['systems']])
  })

  it('says nothing, where it is one write inside a larger act', async () => {
    await db!.transaction(async (tx) => {
      await service.createMany(systems(), caseId, [{ hostname: 'COMPOSED' }], actorId, 'refuse', tx)
    })

    expect(
      announced,
      'a write announced from inside a transaction that had not committed, so a subscriber ' +
        'was sent to read what a rollback could still remove',
    ).toEqual([])
  })

  it('says nothing for a composed write across collections either', async () => {
    await db!.transaction(async (tx) => {
      await service.createAcross(
        caseId,
        actorId,
        [{ def: systems(), rows: [{ hostname: 'COMPOSED-ACROSS' }] }],
        'refuse',
        tx,
      )
    })

    expect(announced, 'the same, through the door an import writes its entities with').toEqual([])
  })
})
