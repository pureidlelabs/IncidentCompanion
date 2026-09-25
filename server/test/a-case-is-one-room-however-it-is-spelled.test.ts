/**
 * A case id is admitted in either letter case, and both spellings are one
 * case: one roster, one deletion check, one document, one stored record.
 *
 * **The attack is the spelling.** A connection naming the case in capitals
 * passed every check and then keyed everything after admission by the string
 * it sent, so it sat in a room of its own.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, gte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { caseSocket, issued, pause, until, type Frame } from './case-socket.js'
import { aDraft, caller, Live, textOf, typed } from './report-writers.js'
import { openTestPool } from './database.js'
import { caseNotes, cases, changeFeed, customers, installActivity, reports } from '../src/db/schema/index.js'
import * as Y from 'yjs'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`

let harness: Harness | undefined
let admin: Persona
let owner: Persona
let reader: Persona
let writer: Persona
let seedPool: ReturnType<typeof openTestPool>
let customer = ''
let caseId = ''
const made: string[] = []
const sockets: WebSocket[] = []

const call = async (who: Persona, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${harness!.base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: who.cookie, origin: harness!.origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> }
}
const ok = async (who: Persona, method: string, path: string, body?: unknown) => {
  const answer = await call(who, method, path, body)
  expect(answer.status, `${method} ${path} answered ${String(answer.status)}`).toBeLessThan(300)
  return answer.body
}

const lower = caseSocket(() => harness!, () => caseId, sockets)
const upper = caseSocket(() => harness!, () => caseId.toUpperCase(), sockets)

/** The analysts the latest roster `heard` names. */
const roster = (heard: Frame[]) => {
  const last = heard.filter((one) => one.type === 'presence').at(-1) as
    | { roster?: { user_id: string }[] }
    | undefined
  return (last?.roster ?? []).map((one) => one.user_id).sort()
}

const seed = () => drizzle({ client: seedPool })

/** A case of its own for each test, so a deletion one lets through leaves the next intact. */
async function aCase(): Promise<void> {
  caseId = (await ok(owner, 'POST', '/api/cases', { title: `One room ${TAG}` }))['id'] as string
  made.push(caseId)
  await ok(owner, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
}

describe.skipIf(!(await bootable()))('a case named in capitals over the live connection', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')
    customer = (await ok(admin, 'POST', '/api/customers', { name: `One room ${TAG}` }))['id'] as string
    const group = (await ok(admin, 'POST', '/api/groups', { name: `One room ${TAG}` }))['id'] as string
    await ok(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    const analyst = async (name: string, level: 'read' | 'write' | 'delete') => {
      const who = await issued(harness!, admin, name, `one-room-${name.toLowerCase()}-${TAG}@example.invalid`)
      await ok(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level })
      return who
    }
    owner = await analyst('Owner', 'delete')
    reader = await analyst('Reader', 'read')
    writer = await analyst('Writer', 'write')
  }, 120_000)


  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    for (const one of made) await seed().delete(cases).where(eq(cases.id, one))
    await seed().delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('puts the analyst in the roster the others see', async () => {
    await aCase()
    const lowerOne = await lower.connect(owner)
    const upperOne = await upper.connect(reader)
    const both = [owner.id, reader.id].sort()
    await until(() => roster(lowerOne.heard).join() === both.join(), 'the owner never saw the reader', 3_000)
    expect(roster(upperOne.heard)).toEqual(both)
    lowerOne.socket.terminate()
    upperOne.socket.terminate()
    await pause(300)
  })

  it('refuses the case deletion while they are connected, by either spelling of the route', async () => {
    await aCase()
    const present = await upper.connect(reader)
    expect((await call(owner, 'DELETE', `/api/cases/${caseId}`)).status).toBe(409)
    present.socket.terminate()
    await pause(300)
    const lowerOne = await lower.connect(reader)
    expect((await call(owner, 'DELETE', `/api/cases/${caseId.toUpperCase()}`)).status).toBe(409)
    lowerOne.socket.terminate()
    await pause(300)
  })

  it('stores the words the connection accepted, named for their writer', async () => {
    await aCase()
    const noteId = (await ok(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' }))['id'] as string
    const watching = await upper.opens(owner, noteId)
    const words = `typed through the capitalised id ${TAG}`
    await upper.types(await upper.opens(writer, noteId), noteId, words, watching)
    await pause(1_500)

    const [row] = await seed()
      .select({ note: caseNotes.note, updatedBy: caseNotes.updatedBy })
      .from(caseNotes)
      .where(eq(caseNotes.id, noteId))
    const feed = await seed()
      .select({ actorId: changeFeed.actorId })
      .from(changeFeed)
      .where(and(eq(changeFeed.entity, 'casenotes'), eq(changeFeed.entityId, noteId), eq(changeFeed.op, 'update')))
    expect({ note: row?.note.includes(words), updatedBy: row?.updatedBy, feed: feed.map((one) => one.actorId) })
      .toEqual({ note: true, updatedBy: writer.id, feed: [writer.id] })
  })

  it('edits one document whichever spelling each writer used', async () => {
    await aCase()
    const noteId = (await ok(owner, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' }))['id'] as string
    const lowerOne = await lower.opens(owner, noteId)
    const upperOne = await upper.opens(writer, noteId)
    await upper.types(upperOne, noteId, `from the capitals ${TAG}`, lowerOne)
    await lower.types(lowerOne, noteId, `from the lower case ${TAG}`, upperOne)
  })

  it('sends the words typed just before a send that names the report in capitals', async () => {
    await aCase()
    const { id, blocks } = await aDraft(caller(harness!, owner), caseId, ['Assessment'])
    const field = `reports:${id}:document`
    const typing = await Live.open(harness!, writer, caseId)
    await typing.openField(field, new Y.Doc())
    typing.send({ type: 'prose.sync', field, update: typed(new Y.Doc(), blocks[0]!.id, `Typed before the send ${TAG}`) })
    await pause(200)
    const sent = await call(owner, 'POST', `/api/cases/${caseId.toUpperCase()}/reports/${id.toUpperCase()}/send`)
    expect(sent.status).toBe(201)
    await typing.close()

    const [row] = await seed().select({ document: reports.document }).from(reports).where(eq(reports.id, id))
    expect(textOf(new Uint8Array(row!.document!), blocks[0]!.id)).toContain(`Typed before the send ${TAG}`)
  })

  it('holds one claim on an entry whichever spelling each analyst claims it by', async () => {
    await aCase()
    const row = randomUUID()
    const holder = await lower.connect(owner)
    const second = await upper.connect(writer)
    holder.socket.send(JSON.stringify({ type: 'claim', table: 'systems', id: row }))
    await pause(300)
    second.socket.send(JSON.stringify({ type: 'claim', table: 'systems', id: row.toUpperCase() }))
    await pause(500)

    const last = holder.heard.filter((one) => one.type === 'presence').at(-1) as { claims: { entry_id: string; user_id: string }[] }
    expect(last.claims.map((one) => `${one.entry_id.toLowerCase()} ${one.user_id}`)).toEqual([`${row} ${owner.id}`])
    holder.socket.terminate()
    second.socket.terminate()
  })

  it('records a refused connection and a refused request against the case in one spelling', async () => {
    await aCase()
    const from = new Date(Date.now() - 50)
    const refused = new WebSocket(`${harness!.base.replace('http://', 'ws://')}/api/cases/${caseId.toUpperCase()}/live`, {
      headers: { origin: harness!.origin },
    })
    refused.on('error', () => {})
    await new Promise<void>((done) => {
      refused.once('unexpected-response', (request) => {
        request.on('error', () => {})
        request.destroy()
        done()
      })
    })
    expect((await call(reader, 'DELETE', `/api/cases/${caseId.toUpperCase()}`)).status).toBe(403)
    await pause(500)

    const lines = await seed()
      .select({ event: installActivity.event, spelled: sql<string>`${installActivity.detail}->>'case'` })
      .from(installActivity)
      .where(and(gte(installActivity.at, from), sql`lower(${installActivity.detail}->>'case') = ${caseId}`))
    expect(lines.map((one) => `${one.event} ${one.spelled}`).sort()).toEqual([`access_denied ${caseId}`, `live_refused ${caseId}`])
  })
})
