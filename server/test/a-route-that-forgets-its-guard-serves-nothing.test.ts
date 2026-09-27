/**
 * A route that forgets its guard still serves nothing of a case its caller
 * does not reach.
 *
 * > An entry-point check is necessary and MUST NOT be the only one.
 *
 * **Every guard is taken away at once**, which is the forgotten
 * `@UseGuards` on every case route there is, and each of those routes is then
 * asked, over HTTP, as an analyst who reaches only the default customer, for a
 * case belonging to a customer they do not reach. What answers is the store.
 *
 * **Swept from the published document**, so a route added tomorrow is asked
 * tomorrow. The same sweep over the analyst's own case is the control: the
 * routes do serve rows without their guards, just not those.
 */
import { randomUUID } from 'node:crypto'

import { and, count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  boot,
  bootable,
  operations,
  sharedAnalyst,
  type Harness,
  type Persona,
} from './app-harness.js'
import { openTestPool } from './database.js'
import { CaseAccessGuard } from '../src/access/case-access.guard.js'
import { caseNotes, cases, customers, systems, timeline } from '../src/db/schema/index.js'

const STAMP = `${String(process.pid)}-${String(Date.now())}`
/** Written into every row of the case out of reach, and looked for in every answer. */
const THEIRS_SAYS = `out-of-reach-${STAMP}`
const MINE_SAYS = `within-reach-${STAMP}`

let harness: Harness
let analyst: Persona
let seedPool: ReturnType<typeof openTestPool>
let theirs = ''
let mine = ''
let customer = ''

const seed = () => drizzle({ client: seedPool })

async function aCaseSaying(marker: string, customerId: string | null): Promise<string> {
  const db = seed()
  const [made] = await db
    .insert(cases)
    .values({ title: marker, reference: marker, summary: marker, customerId })
    .returning({ id: cases.id })
  const caseId = made!.id
  await db.insert(timeline).values({ caseId, kind: 'event', time: new Date(), description: marker })
  await db.insert(systems).values({ caseId, hostname: marker })
  await db.insert(caseNotes).values({ caseId, note: marker })
  return caseId
}

/** Every case route that reads, asked for `caseId` as the analyst: what each one said. */
async function everyReadOf(caseId: string): Promise<{ route: string; said: string }[]> {
  const reads = operations(harness.document, { caseId }).filter(
    (one) => one.method === 'GET' && one.template.includes('{caseId}'),
  )
  expect(reads.length, 'the document publishes no case route to sweep').toBeGreaterThan(10)
  const answers = []
  for (const one of reads) {
    const response = await fetch(`${harness.base}${one.path}`, {
      headers: { cookie: analyst.cookie },
    })
    answers.push({ route: `${one.method} ${one.template}`, said: await response.text() })
  }
  for (const listing of ['/api/cases', '/api/recent-cases']) {
    const response = await fetch(`${harness.base}${listing}`, {
      headers: { cookie: analyst.cookie },
    })
    answers.push({ route: `GET ${listing}`, said: await response.text() })
  }
  return answers
}

describe.skipIf(!(await bootable()))('a case route with its guard forgotten', () => {
  beforeAll(async () => {
    harness = await boot()
    analyst = await sharedAnalyst(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')

    const [made] = await seed()
      .insert(customers)
      .values({ name: `Nobody here reaches ${STAMP}` })
      .returning({ id: customers.id })
    customer = made!.id
    theirs = await aCaseSaying(THEIRS_SAYS, customer)
    mine = await aCaseSaying(MINE_SAYS, null)
  }, 90_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    await seed().delete(cases).where(eq(cases.id, theirs))
    await seed().delete(cases).where(eq(cases.id, mine))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('serves none of a case out of reach through any route', async () => {
    vi.spyOn(CaseAccessGuard.prototype, 'canActivate').mockResolvedValue(true)
    try {
      const leaked = (await everyReadOf(theirs)).filter((one) => one.said.includes(THEIRS_SAYS))
      expect(
        leaked.map((one) => one.route),
        'these routes served a case the caller does not reach, once nothing but the store stood in the way',
      ).toEqual([])

      // The control: the same routes, unguarded, do serve what the caller reaches.
      const served = (await everyReadOf(mine)).filter((one) => one.said.includes(MINE_SAYS))
      expect(
        served.map((one) => one.route),
        'the sweep read nothing even of a reached case, so the refusal above proves nothing',
      ).toEqual(
        expect.arrayContaining([
          'GET /api/cases/{caseId}',
          'GET /api/cases/{caseId}/timeline',
          'GET /api/cases',
        ]),
      )
    } finally {
      vi.restoreAllMocks()
    }
  }, 120_000)

  it('writes nothing into a case out of reach through a route', async () => {
    vi.spyOn(CaseAccessGuard.prototype, 'canActivate').mockResolvedValue(true)
    const as = (method: string, path: string, body?: unknown) =>
      fetch(`${harness.base}${path}`, {
        method,
        headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    try {
      const [before] = await seed().select().from(cases).where(eq(cases.id, theirs))
      await as('POST', `/api/cases/${theirs}/timeline`, {
        kind: 'event',
        time: new Date().toISOString(),
        description: 'planted',
      })
      await as('PATCH', `/api/cases/${theirs}`, { version: before!.version, title: 'renamed' })
      await as('PUT', `/api/cases/${theirs}/customer`, { customerId: randomUUID() })
      await as('DELETE', `/api/cases/${theirs}`)

      const [after] = await seed().select().from(cases).where(eq(cases.id, theirs))
      const [planted] = await seed()
        .select({ n: count() })
        .from(timeline)
        .where(and(eq(timeline.caseId, theirs), eq(timeline.description, 'planted')))
      expect(after, 'the case was deleted by a caller who does not reach it').toBeDefined()
      expect(after!.title).toBe(THEIRS_SAYS)
      expect(after!.customerId).toBe(customer)
      expect(planted!.n, 'a row was written into a case the caller does not reach').toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  }, 60_000)

  /**
   * **The store's refusal is an answer, not a fault.** A write it refuses for
   * reach reaches the caller as the case not being there, which is also what
   * a route with its guard answers.
   */
  it('answers a write into a case out of reach as it answers one into no case', async () => {
    vi.spyOn(CaseAccessGuard.prototype, 'canActivate').mockResolvedValue(true)
    const planting = async (caseId: string) => {
      const response = await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        method: 'POST',
        headers: { cookie: analyst.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'event', time: new Date().toISOString(), description: 'planted' }),
      })
      return { status: response.status, said: (await response.text()).replaceAll(caseId, '{caseId}') }
    }
    try {
      const absent = await planting(randomUUID())
      expect(await planting(theirs)).toEqual(absent)
      expect(absent.status).toBe(404)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
