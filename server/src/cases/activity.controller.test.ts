import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ActivityController } from './activity.controller.js'
import { openTestPool } from '../../test/database.js'
import { cases, changeFeed, user } from '../db/schema/index.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.**
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

/**
 * **What the case activity feed serves, and what it deliberately does not.**
 */
describe.skipIf(!db)('the case activity feed', () => {
  let controller: ActivityController
  let caseId: string
  const actorId = 'activity-analyst'
  const otherId = 'activity-colleague'

  beforeAll(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values([
        {
          id: actorId,
          name: 'Activity Analyst',
          email: 'activity@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: otherId,
          name: 'Activity Colleague',
          email: 'colleague@example.test',
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .onConflictDoNothing()

    const [row] = await seed!
      .insert(cases)
      .values({ title: 'Activity under test', createdBy: actorId })
      .returning()
    caseId = row!.id

    // Oldest first, so `seq` orders them the way they happened.
    await seed!.insert(changeFeed).values([
      {
        caseId,
        entity: 'systems',
        entityId: '11111111-1111-4111-8111-111111111111',
        op: 'insert',
        version: 1,
        actorId,
        fields: ['hostname'],
      },
      {
        caseId,
        entity: 'systems',
        entityId: '11111111-1111-4111-8111-111111111111',
        op: 'update',
        version: 2,
        actorId,
        fields: ['analyst', 'verdict'],
      },
      {
        caseId,
        entity: 'evidence',
        entityId: '22222222-2222-4222-8222-222222222222',
        op: 'insert',
        version: 1,
        actorId: otherId,
        fields: ['name', 'type'],
      },
    ])

    controller = new ActivityController(db!)
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  /**
   * **The whole difference from attribution, in one assertion.**
   */
  it('keeps every write, where attribution keeps only the last', async () => {
    const { rows } = await controller.activity(caseId)

    const onSystem = rows.filter((one) => one.entity === 'systems')
    expect(onSystem).toHaveLength(2)
    expect(onSystem.map((one) => one.version)).toEqual([2, 1])
  })

  /** Newest first, because a feed is read from the top. */
  it('answers newest first', async () => {
    const { rows } = await controller.activity(caseId)

    const seqs = rows.map((one) => one.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a))
  })

  /**
   * **The actor is a name, joined here.**
   */
  it('names the actor rather than showing an id', async () => {
    const { rows } = await controller.activity(caseId)

    expect(rows.map((one) => one.by)).toContain('Activity Analyst')
    expect(rows.map((one) => one.by)).toContain('Activity Colleague')
    expect(rows.every((one) => one.by !== actorId)).toBe(true)
  })

  /**
   * **The fields are already stored, and this is what they are for.**
   */
  it('carries which fields the write touched', async () => {
    const { rows } = await controller.activity(caseId)

    const update = rows.find((one) => one.op === 'update')
    expect(update?.fields).toEqual(['analyst', 'verdict'])
  })

  /**
   * **A delete stays**, which is the other difference from attribution.
   */
  it('keeps a delete', async () => {
    await seed!.insert(changeFeed).values({
      caseId,
      entity: 'evidence',
      entityId: '22222222-2222-4222-8222-222222222222',
      op: 'delete',
      version: 2,
      actorId,
      fields: [],
    })

    const { rows } = await controller.activity(caseId)

    expect(rows.some((one) => one.op === 'delete')).toBe(true)
  })

  /**
   * **Capped, because the caller is a popover.**
   */
  it('caps what it returns', async () => {
    const many = Array.from({ length: 60 }, (_unused, index) => ({
      caseId,
      entity: 'timeline' as const,
      entityId: '33333333-3333-4333-8333-333333333333',
      op: 'update' as const,
      version: index + 1,
      actorId,
      fields: ['description'],
    }))
    await seed!.insert(changeFeed).values(many)

    const { rows } = await controller.activity(caseId)

    expect(rows.length).toBeLessThanOrEqual(50)
  })
})
