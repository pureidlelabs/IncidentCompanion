/**
 * A collection of events has no identity, so two alike rows stay two rows.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { identitiesOf } from './identity.js'
import { CollectionService } from './collection.service.js'
import { DEFINITION as TIMELINE } from './timeline.controller.js'
import { cases, timeline, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

/** What the specification says is an event: two alike are two facts. */
const EVENTS = [
  'timeline',
  'actions',
  'casenotes',
  'evidence',
  'impact',
  'reports',
  'reportBlocks',
] as const

/**
 * And what it says has an identity, each with a row that satisfies its rule.
 */
const KEYED = [
  ['systems', { hostname: 'WKS-1' }],
  ['accounts', { accountName: 'a.analyst', domain: 'example.test' }],
  ['network_indicators', { value: '10.0.0.1', type: 'ip', scope: 'internal' }],
  ['malware', { filename: 'thing.exe', family: 'Nothing' }],
  ['cloud_apps', { appName: 'Something', instance: 'eu1' }],
] as const

const ACTOR = 'twice-imported-analyst'
const SAME = {
  kind: 'event' as const,
  time: new Date('2026-06-01T12:00:00.000Z'),
  description: 'The same thing, supplied twice',
}

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('a collection whose rows are events', () => {
  let service: CollectionService
  let caseId = ''

  beforeAll(async () => {
    service = new CollectionService(db!)
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: ACTOR,
        name: 'Twice Imported Analyst',
        email: `${ACTOR}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()

    const [made] = await seed!
      .insert(cases)
      .values({ title: 'A case supplied the same entry twice' })
      .returning({ id: cases.id })
    caseId = made!.id
  }, 90_000)

  afterAll(async () => {
    if (caseId !== '') await seed!.delete(cases).where(eq(cases.id, caseId))
    await pool!.end()
  })

  it.each(EVENTS)('%s yields no identity, however alike two rows are', (collection) => {
    expect(
      identitiesOf(collection, { ...SAME, time: SAME.time.toISOString() }),
      `${collection} has an identity rule, so two entries that look alike can be merged and ` +
        'one of the two facts lost',
    ).toEqual([])
  })

  it.each(KEYED)('%s does have one, so the case above is not vacuous', (collection, row) => {
    expect(
      identitiesOf(collection, row).length,
      `${collection} yields no identity either, so the rule above holds for everything and ` +
        'says nothing about events',
    ).toBeGreaterThan(0)
  })

  it('keeps both when the same entry is supplied twice, and merges nothing', async () => {
    const first = (await service.create(TIMELINE, caseId, { ...SAME }, ACTOR)) as { id: string }
    const second = (await service.create(TIMELINE, caseId, { ...SAME }, ACTOR)) as { id: string }

    expect(second.id, 'the second write answered with the first row, so it was merged').not.toBe(
      first.id,
    )

    const held = await seed!.select().from(timeline).where(eq(timeline.caseId, caseId))
    expect(
      held,
      'the case holds one entry after two were supplied, so one of two facts was lost',
    ).toHaveLength(2)
  })
})
