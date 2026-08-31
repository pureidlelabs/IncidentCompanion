/**
 * Do two server instances converge on one report, over real Redis?
 *
 * **The suite proves this against a fake bus**, which asserts the service uses
 * the relay it is given - not that `PresenceStore` satisfies the interface, and
 * not that Redis pub/sub actually carries the frame. Nest's `useExisting`
 * binding is a runtime lookup with no type check behind it, so the two halves
 * agreeing is inspection until something drives them.
 *
 *   DATABASE_URL=... REDIS_URL=... npx tsx scripts/prose-two-instances.ts
 *
 * Outside `src/` for the same reason as the report check: an instrument, and it
 * crosses tiers the layering rule keeps apart inside the tree.
 */
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as Y from 'yjs'

import { CasesService } from '../src/cases/cases.service.js'
import { PresenceStore } from '../src/live/presence.store.js'
import { ProseService, reportDocument } from '../src/prose/prose.service.js'
import { reports } from '../src/db/schema/report.js'

/** `PresenceStore` takes a Nest config service; this is the one value it reads. */
const config = {
  get: () => process.env.REDIS_URL ?? 'redis://127.0.0.1:56379',
} as unknown as ConstructorParameters<typeof PresenceStore>[0]

/**
 * Whoever the install already has.
 *
 * **A case names its author and the column is a foreign key**, so an invented
 * id is refused outright - which is the first thing this script hit.
 */
async function anAnalyst(db: ReturnType<typeof drizzle>): Promise<string> {
  // `execute` answers a pg result, not an array of rows.
  const answered = await db.execute<{ id: string }>(sql`select id from "user" limit 1`)
  const id = answered.rows[0]?.id
  if (!id) throw new Error('no account exists to raise a case as')
  return id
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' })
  const db = drizzle({ client: pool })

  // **Two stores, not one shared object.** One store would relay in memory
  // through its own listener map and never touch Redis, which is the whole
  // thing being checked.
  const storeOne = new PresenceStore(config)
  const storeTwo = new PresenceStore(config)

  const cases = new CasesService(db, {
    announce: () => {},
    othersOn: () => Promise.resolve([]),
  } as never)

  /**
   * **The fixture is written as the seed role, the check runs as the app one.**
   * A bare insert on the app handle is refused by row-level security - the
   * policy is default-deny outside a scoped transaction, which is the whole
   * point of it. The subject under test keeps the app handle: if it forgets to
   * scope itself, it fails here.
   */
  const seedPool = new Pool({
    connectionString: process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  })
  const seed = drizzle({ client: seedPool })

  const actorId = await anAnalyst(seed)
  const kase = await cases.create({ title: 'Two instances over Redis' }, actorId)
  const [report] = await seed
    .insert(reports)
    .values({ caseId: kase.id, label: 'Under test', createdBy: actorId })
    .returning()

  const one = new ProseService(db, storeOne)
  const two = new ProseService(db, storeTwo)

  const here = await one.open(kase.id, reportDocument(report!.id))
  const there = await two.open(kase.id, reportDocument(report!.id))

  // An edit on instance one, in the shape the editor makes.
  const typed = new Y.Doc({ gc: false })
  const para = new Y.XmlElement('paragraph')
  const text = new Y.XmlText()
  text.insert(0, 'written on instance one')
  para.insert(0, [text])
  typed.getXmlFragment('block-1').insert(0, [para])
  one.applySync(here, one.frameUpdate(Y.encodeStateAsUpdate(typed)), 'a-socket')

  // Redis is a round trip; the fake bus was synchronous.
  await new Promise((resolve) => setTimeout(resolve, 300))

  const arrived = there.getXmlFragment('block-1').toJSON()
  console.log('instance two sees:', JSON.stringify(arrived))
  console.log(arrived.includes('written on instance one') ? 'CONVERGED' : 'DID NOT CONVERGE')

  await one.release(kase.id, reportDocument(report!.id))
  await two.release(kase.id, reportDocument(report!.id))
  await storeOne.onApplicationShutdown()
  await storeTwo.onApplicationShutdown()
  await pool.end()
  await seedPool.end()
}

void main()
