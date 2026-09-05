/**
 * That every entity collection the React client asks for is actually served.
 */
import { PATH_METADATA } from '@nestjs/common/constants'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { ENTITY_CONTROLLERS } from './entities.controller.js'
import { DemoContentSeeder } from '../demos/content.seeder.js'
import { DemoSeederService } from '../demos/seeder.service.js'
import { cases } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

/**
 * Every collection the client asks for, `reports` and `report_blocks`
 * included - they are ordinary collections, and a pane asking for one that is
 * not mounted gets a 404 that reads as the screen being broken.
 */
const SERVED = [
  'systems',
  'accounts',
  'malware',
  'network_indicators',
  'impact',
  'cloud_apps',
  'evidence',
  'methods',
  'actions',
  'casenotes',
  'reports',
  'report_blocks',
]

describe('the entity collections are routed', () => {
  it('mounts one controller per collection, at the name the client uses', () => {
    const paths = ENTITY_CONTROLLERS.map((c) => Reflect.getMetadata(PATH_METADATA, c) as string)
    expect(paths.sort()).toEqual(SERVED.map((n) => `api/cases/:caseId/${n}`).sort())
  })
})

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

describe.skipIf(!db)('the entity collections serve their rows', () => {
  let caseId: string

  beforeAll(async () => {
    await seed!.delete(cases)
    await new DemoSeederService(seed!, seed, new DemoContentSeeder(seed)).reseed()
    const [row] = await seed!.select().from(cases).where(eq(cases.reference, 'DEMO-2026-001'))
    caseId = row!.id
  })

  afterAll(async () => {
    await seed!.delete(cases)
    await pool!.end()
  })

  /**
   * The guided demo's own counts, taken from the seed it is built by.
   */
  it.each([
    ['systems', 3],
    ['accounts', 3],
    ['malware', 2],
    ['network_indicators', 3],
    ['impact', 1],
    ['cloud_apps', 1],
    ['evidence', 1],
  ])('serves %s', async (name, expected) => {
    const controller = ENTITY_CONTROLLERS.find(
      (c) => Reflect.getMetadata(PATH_METADATA, c) === `api/cases/:caseId/${name}`,
    )!
    const instance = new (
      controller as new (s: CollectionService) => {
        list(id: string): Promise<unknown[]>
      }
    )(new CollectionService(db!))
    expect(await instance.list(caseId)).toHaveLength(expected)
  })

  /**
   * **A demo's clock starts when it is seeded**, and two columns nearly broke
   * that silently.
   *
   * Asserted as a *window*, not a value: the point is that it moved with the
   * seed, and any exact expectation here would be a second clock to keep.
   */
  it('resolves the two time columns that do not say "at" against the seed', async () => {
    const accountsController = ENTITY_CONTROLLERS.find(
      (c) => Reflect.getMetadata(PATH_METADATA, c) === 'api/cases/:caseId/accounts',
    )!
    const service = new CollectionService(db!)
    const rows = (await new (
      accountsController as new (s: CollectionService) => {
        list(id: string): Promise<Record<string, unknown>[]>
      }
    )(service).list(caseId))

    const stamps = rows
      .map((row) => row['lastActivity'])
      .filter((value): value is string => typeof value === 'string' && value !== '')
    expect(stamps.length).toBeGreaterThan(0)

    const dayMs = 24 * 60 * 60 * 1000
    for (const stamp of stamps) {
      const parsed = Date.parse(stamp)
      expect(Number.isNaN(parsed), `${stamp} is not a parseable timestamp`).toBe(false)
      // The guided demo spans about a day and a half either side of its start.
      expect(Math.abs(parsed - Date.now())).toBeLessThan(3 * dayMs)
    }
  })
})
