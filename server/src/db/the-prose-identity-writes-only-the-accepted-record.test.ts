/**
 * The identity accepted prose is kept under writes that one record's words, in
 * its own case, and the rows the save owes, and nothing else.
 *
 * **Attempted as the identity, from the role the server connects as**, the way
 * the save enters it, with no service in front: each attack names the accepted
 * record and case and then reaches for something past them.
 */
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { caseNotes, cases, proseAcceptances, reports, user } from './schema/index.js'
import { CHANNEL_OF } from './schema/install-activity.js'
import { SENT_REPORT_REFUSED } from './schema/store-guards.js'
import { asRole, hasConcurrentConnections, openTestPool } from '../../test/database.js'
import { OCSF_VERSION, classify } from '../install-activity/ocsf.js'
import { retentionClassOf } from '../install-activity/retention-class.js'
import { ProseService } from '../prose/prose.service.js'

const URL_ = process.env.DATABASE_URL ?? ''
const appPool = URL_ ? openTestPool(URL_, 'ic_app') : null
const app = appPool ? drizzle({ client: appPool }) : null
const seedPool = URL_ ? openTestPool(asRole(URL_, 'ic_seed')) : null
const seed = seedPool ? drizzle({ client: seedPool }) : null

let caseA = ''
let caseB = ''
let noteA = ''
let otherNoteA = ''
let noteB = ''
let sentReport = ''
const writer = `prose-identity-writer-${String(process.pid)}-${String(Date.now())}`

/** Runs `statement` as the prose identity with `record` in `kase` accepted; answers the rows it touched, or the SQLSTATE it raised. */
async function asProse(
  kase: string,
  record: string,
  statement: ReturnType<typeof sql>,
): Promise<number | string> {
  try {
    return await app!.transaction(async (tx) => {
      await tx.execute(sql`set local role ic_prose`)
      await tx.execute(
        sql`select set_config('app.case_id', ${kase}, true), set_config('app.prose_record', ${record}, true), set_config('app.principal', '', true)`,
      )
      const answer = await tx.execute(statement)
      return answer.rowCount ?? 0
    })
  } catch (error) {
    for (let at: unknown = error; at instanceof Object; at = (at as { cause?: unknown }).cause) {
      const code = (at as { code?: unknown }).code
      if (typeof code === 'string') return code
    }
    throw error
  }
}

const PERMISSION = '42501'

describe.skipIf(!app || !hasConcurrentConnections())('the prose identity', () => {
  beforeAll(async () => {
    await seed!.insert(user).values({
      id: writer,
      name: writer,
      email: `${writer}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: 'analyst',
    })
    const [a] = await seed!.insert(cases).values({ title: 'Prose identity A' }).returning()
    const [b] = await seed!.insert(cases).values({ title: 'Prose identity B' }).returning()
    caseA = a!.id
    caseB = b!.id
    const notes = await seed!
      .insert(caseNotes)
      .values([
        { caseId: caseA, note: 'a' },
        { caseId: caseA, note: 'a2' },
        { caseId: caseB, note: 'b' },
      ])
      .returning()
    ;[noteA, otherNoteA, noteB] = notes.map((one) => one.id) as [string, string, string]
    const [paper] = await seed!.insert(reports).values({ caseId: caseA, label: 'Sent' }).returning()
    sentReport = paper!.id
    await seed!
      .update(reports)
      .set({ sentAt: new Date(), frozen: {}, frozenAt: new Date() })
      .where(eq(reports.id, sentReport))
    await seed!.insert(proseAcceptances).values([
      { caseId: caseA, entity: 'casenotes', recordId: noteA, writerId: writer },
      { caseId: caseA, entity: 'reports', recordId: sentReport, writerId: writer },
    ])
  })

  afterAll(async () => {
    if (caseA) await seed!.delete(cases).where(eq(cases.id, caseA))
    if (caseB) await seed!.delete(cases).where(eq(cases.id, caseB))
    await seed!.delete(user).where(eq(user.id, writer))
    await appPool?.end()
    await seedPool?.end()
  })

  it('stores the words of the accepted record', async () => {
    expect(
      await asProse(caseA, noteA, sql`update casenotes set note = 'kept', updated_by = ${writer} where id = ${noteA}`),
    ).toBe(1)
  })

  it('writes no other record in the same case', async () => {
    expect(
      await asProse(caseA, noteA, sql`update casenotes set note = 'x' where id = ${otherNoteA}`),
    ).toBe(0)
  })

  it('writes no record in another case, whichever record it names', async () => {
    expect(
      await asProse(caseA, noteB, sql`update casenotes set note = 'x' where id = ${noteB}`),
    ).toBe(0)
    expect(
      await asProse(caseA, noteA, sql`update casenotes set note = 'x' where id = ${noteB}`),
    ).toBe(0)
  })

  it('writes no other column of the accepted record', async () => {
    expect(
      await asProse(caseA, noteA, sql`update casenotes set author = 'x' where id = ${noteA}`),
    ).toBe(PERMISSION)
    expect(
      await asProse(caseA, noteA, sql`update casenotes set version = 99 where id = ${noteA}`),
    ).toBe(PERMISSION)
  })

  it('writes no other table', async () => {
    expect(await asProse(caseA, noteA, sql`update cases set title = 'x' where id = ${caseA}`)).toBe(
      PERMISSION,
    )
    expect(await asProse(caseA, noteA, sql`delete from casenotes where id = ${noteA}`)).toBe(
      PERMISSION,
    )
    expect(
      await asProse(
        caseA,
        noteA,
        sql`insert into casenotes (case_id, note) values (${caseA}, 'x')`,
      ),
    ).toBe(PERMISSION)
  })

  it('reads nothing but who was accepted into the record it stores, and whether an account exists', async () => {
    expect(await asProse(caseA, noteA, sql`select writer_id from prose_acceptances`)).toBe(1)
    expect(await asProse(caseA, noteA, sql`select id from "user" where id = ${writer}`)).toBe(1)
    expect(await asProse(caseA, noteA, sql`select note from casenotes`)).toBe(PERMISSION)
    expect(await asProse(caseA, noteA, sql`select title from cases`)).toBe(PERMISSION)
    expect(await asProse(caseA, noteA, sql`select email from "user"`)).toBe(PERMISSION)
    expect(await asProse(caseA, noteA, sql`select actor_label from install_activity`)).toBe(
      PERMISSION,
    )
    expect(await asProse(caseA, noteA, sql`select actor_id from change_feed`)).toBe(PERMISSION)
  })

  it('writes a feed row and an audit line for the accepted record, and for no other', async () => {
    const feed = (record: string) =>
      sql`insert into change_feed (case_id, entity, entity_id, op, version, actor_id) values (${caseA}, 'casenotes', ${record}, 'update', 1, ${writer})`
    const ocsf = classify('api_called')
    const line = (record: string) =>
      sql`insert into install_activity (event, channel, retention_class, class_uid, activity_id, type_uid, schema_version, severity_id, status_id, actor_id, detail)
          values ('api_called', ${CHANNEL_OF.api_called}, ${retentionClassOf('api_called')}, ${ocsf.classUid}, ${ocsf.activityId}, ${ocsf.typeUid}, ${OCSF_VERSION}, 1, 1, ${writer}, ${JSON.stringify({ case: caseA, record })}::jsonb)`
    expect(await asProse(caseA, noteA, feed(noteA))).toBe(1)
    expect(await asProse(caseA, noteA, line(noteA))).toBe(1)
    expect(await asProse(caseA, noteA, feed(otherNoteA))).toBe(PERMISSION)
    expect(await asProse(caseA, noteA, line(otherNoteA))).toBe(PERMISSION)
  })

  it('stores nothing into a sent report', async () => {
    expect(
      await asProse(
        caseA,
        sentReport,
        sql`update reports set document = '\\x00', updated_by = ${writer} where id = ${sentReport}`,
      ),
    ).toBe(SENT_REPORT_REFUSED)
  })

  it('refuses to start for a connection that cannot become it', async () => {
    await expect(new ProseService(seed!).assertIdentity()).rejects.toThrow(/ic_prose/)
    await expect(new ProseService(app!).assertIdentity()).resolves.toBeUndefined()
  })
})
