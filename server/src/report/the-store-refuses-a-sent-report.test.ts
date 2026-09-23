/**
 * A sent report, attacked with statements no application path wrote.
 *
 * The attacker is the application's own role inside its own case scope, and
 * then the seeding role, which reads past every scope. Nothing here goes
 * through `CollectionService`, the lifecycle or the socket: a write the store
 * refuses on its own is refused for a door nobody has written yet.
 */
import { sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { withCase } from '../db/scope.js'
import { SENT_REPORT_REFUSED } from '../db/schema/store-guards.js'
import { hasConcurrentConnections, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const app = pool ? drizzle({ client: pool }) : null
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

/** The SQLSTATE and detail of a refused statement, wherever the driver put them. */
function refusal(error: unknown): { code?: string; detail?: string } {
  for (let at: unknown = error; at; at = (at as { cause?: unknown }).cause) {
    const { code, detail } = at as { code?: string; detail?: string }
    if (code) return { code, detail }
  }
  return {}
}

async function refusedAsApp(caseId: string, statement: SQL): Promise<{ code?: string; detail?: string }> {
  try {
    await withCase(app!, caseId, (tx) => tx.execute(statement))
  } catch (error) {
    return refusal(error)
  }
  return {}
}

const rows = async (query: SQL) => (await seed!.execute(query)).rows

describe.skipIf(!app || !seed || !hasConcurrentConnections())('a sent report, written to past the application', () => {
  const account = `store-freeze-${String(process.pid)}`
  let caseId = ''
  let sentId = ''
  let sentBlock = ''
  let draftId = ''
  let draftBlock = ''
  let before: unknown[] = []

  const snapshot = () =>
    rows(sql`
      select r.id, r.label, r.document, r.sent_at, r.version,
             (select json_agg(b order by b.id) from report_blocks b where b.report_id = r.id) as blocks
        from reports r where r.id = ${sentId}`)

  beforeAll(async () => {
    await seed!.execute(sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values (${account}, 'Store Freeze', ${`${account}@example.test`}, true, now(), now())`)
    caseId = String(
      (await rows(sql`insert into cases (title, created_by) values ('A filed report', ${account}) returning id`))[0]!['id'],
    )
    const report = async (label: string) =>
      String(
        (await rows(sql`
          insert into reports (case_id, label, created_by, updated_by)
          values (${caseId}, ${label}, ${account}, ${account}) returning id`))[0]!['id'],
      )
    const block = async (reportId: string) =>
      String(
        (await rows(sql`
          insert into report_blocks (case_id, report_id, heading, created_by)
          values (${caseId}, ${reportId}, 'Findings', ${account}) returning id`))[0]!['id'],
      )
    sentId = await report('Filed')
    sentBlock = await block(sentId)
    draftId = await report('Still a draft')
    draftBlock = await block(draftId)
    // The stamp is the last write a report takes.
    await seed!.execute(sql`update reports set sent_at = now(), frozen = '{}'::jsonb, frozen_at = now() where id = ${sentId}`)
    before = await snapshot()
  })

  afterAll(async () => {
    await seed!.execute(sql`delete from cases where id = ${caseId}`)
    await seed!.execute(sql`delete from "user" where id = ${account}`)
    await pool!.end()
    await seedPool!.end()
  })

  const attacks: [string, () => SQL][] = [
    ['its prose is replaced', () => sql`update reports set document = decode('00', 'hex') where id = ${sentId}`],
    ['it is renamed', () => sql`update reports set label = 'Renamed after filing' where id = ${sentId}`],
    ['its stamp is taken off', () => sql`update reports set sent_at = null where id = ${sentId}`],
    ['it is deleted', () => sql`delete from reports where id = ${sentId}`],
    [
      'a part is added',
      () => sql`insert into report_blocks (case_id, report_id, heading) values (${caseId}, ${sentId}, 'Added later')`,
    ],
    ['a part is rewritten', () => sql`update report_blocks set heading = 'Rewritten' where id = ${sentBlock}`],
    ['a part is moved within it', () => sql`update report_blocks set position = 7 where id = ${sentBlock}`],
    ['a part is removed', () => sql`delete from report_blocks where id = ${sentBlock}`],
    ['a draft part is moved into it', () => sql`update report_blocks set report_id = ${sentId} where id = ${draftBlock}`],
    ['one of its parts is moved out', () => sql`update report_blocks set report_id = ${draftId} where id = ${sentBlock}`],
  ]

  it.each(attacks)('refuses the application when %s, naming the report', async (_what, statement) => {
    const refused = await refusedAsApp(caseId, statement())
    expect(refused.code).toBe(SENT_REPORT_REFUSED)
    expect(JSON.parse(refused.detail ?? '{}')).toMatchObject({ reportId: sentId, label: 'Filed' })
  })

  it.each(attacks)('refuses the seeding role, which no scope confines, when %s', async (_what, statement) => {
    await expect(seed!.execute(statement())).rejects.toSatisfy(
      (error: unknown) => refusal(error).code === SENT_REPORT_REFUSED,
    )
  })

  it('leaves the report and its parts as they were stamped', async () => {
    expect(await snapshot()).toEqual(before)
  })

  it('still lets a draft be written, so the refusals above are about the stamp', async () => {
    const renamed = await refusedAsApp(caseId, sql`update reports set label = 'Renamed draft' where id = ${draftId}`)
    const added = await refusedAsApp(
      caseId,
      sql`insert into report_blocks (case_id, report_id, heading) values (${caseId}, ${draftId}, 'Added')`,
    )
    expect([renamed, added]).toEqual([{}, {}])
  })

  it('lets an account that wrote the report be deleted, nulling its name on the report', async () => {
    const other = `${account}-leaver`
    await seed!.execute(sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values (${other}, 'Leaver', ${`${other}@example.test`}, true, now(), now())`)
    await seed!.execute(sql`update reports set updated_by = ${other} where id = ${draftId}`)
    await seed!.execute(sql`update reports set sent_at = now(), frozen = '{}'::jsonb where id = ${draftId}`)

    await seed!.execute(sql`delete from "user" where id = ${other}`)

    expect(await rows(sql`select updated_by, sent_at is not null as sent from reports where id = ${draftId}`)).toEqual([
      { updated_by: null, sent: true },
    ])
  })

  it('lets the case be deleted with its sent report in it', async () => {
    const doomed = String(
      (await rows(sql`insert into cases (title, created_by) values ('Doomed', ${account}) returning id`))[0]!['id'],
    )
    const filed = String(
      (await rows(sql`insert into reports (case_id, label) values (${doomed}, 'Filed') returning id`))[0]!['id'],
    )
    await seed!.execute(sql`insert into report_blocks (case_id, report_id) values (${doomed}, ${filed})`)
    await seed!.execute(sql`update reports set sent_at = now() where id = ${filed}`)

    await seed!.execute(sql`delete from cases where id = ${doomed}`)

    expect(await rows(sql`select 1 from reports where case_id = ${doomed}`)).toEqual([])
    expect(await rows(sql`select 1 from report_blocks where case_id = ${doomed}`)).toEqual([])
  })
})
