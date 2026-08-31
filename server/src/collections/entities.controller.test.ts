/**
 * That every entity collection the React client asks for is actually served.
 *
 * **Written from the defect, not from the intention.** The Assets table
 * rendered its header, its filter chips and a correct count of 3, and then
 * showed "Not Found" - because `GET /api/cases/:id/systems` did not exist. Not
 * one server test failed, and nothing in the UI suite can see it either: the
 * count comes from the case document and the rows come from a second request,
 * so a missing collection route looks exactly like an empty table.
 *
 * **The path is asserted against the client's own spelling.**
 * `network_indicators` and `cloud_apps` are the names in `COLLECTION_NAMES`
 * (`ui/src/api/model.ts`), and a controller mounted at `network-indicators`
 * would pass every other check here while serving nobody.
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
 *
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.** Row-level security refuses an unscoped write, so a fixture on the
 * app handle fails before the test it was arranging ever runs. The subject
 * under test keeps `db` - if it forgets to scope itself, it fails here.
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
   * The guided demo's own counts, taken from the seed it is built by. Asserted as
   * numbers rather than "more than none": an empty collection and a collection
   * whose rows went to the wrong case both pass a truthiness check, and the
   * second is what a wrong `caseId` filter does.
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
   * that silently. `firstSeen` and `lastActivity` carry a time without the
   * word "at" in their name, so the seeder's `*AtMinute` rule skipped them and
   * the fixture kept the absolute stamps the lift happened to compute - a
   * demo whose accounts were last active on whatever day the generator ran.
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
