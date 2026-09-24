/**
 * A read-level analyst's claim and prose edit over the case socket are refused,
 * and each refusal is recorded as the same analyst's refused HTTP write is.
 * Frames are built the way the shipping client builds them.
 */
import { and, eq, gte, or, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import { writeUpdate } from 'y-protocols/sync'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'
import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installActivity } from '../src/db/schema/index.js'

const runnable = await bootable()

describe.skipIf(!runnable)('a refused socket frame, beside a refused request', () => {
  let h: Harness
  let admin: Persona
  let reader: Persona
  let caseId = ''
  let rowId = ''
  let rowVersion = 0
  let noteId = ''

  const call = async (who: Persona, method: string, path: string, body?: unknown) => {
    const r = await fetch(`${h.base}${path}`, {
      method,
      headers: { cookie: who.cookie, 'content-type': 'application/json', origin: h.origin },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const t = await r.text()
    return { status: r.status, body: (t ? JSON.parse(t) : {}) as Record<string, unknown> }
  }

  // Lines by the reader, since `from`, that name this case in target or detail.
  const linesNamingCase = (from: Date) =>
    h.app
      .get<Database>(DATABASE)
      .select({ event: installActivity.event, statusId: installActivity.statusId, target: installActivity.targetLabel, detail: installActivity.detail })
      .from(installActivity)
      .where(
        and(
          eq(installActivity.actorId, reader.id),
          gte(installActivity.at, from),
          or(eq(installActivity.targetLabel, caseId), sql`${installActivity.detail}->>'case' = ${caseId}`),
        ),
      )

  beforeAll(async () => {
    h = await boot()
    admin = await sharedAdmin(h)
    reader = await sharedAnalyst(h)
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    caseId = String((await call(admin, 'POST', '/api/cases', { title: `refused-frame-${stamp}` })).body['id'])
    const row = await call(admin, 'POST', `/api/cases/${caseId}/systems`, { hostname: 'ws-refused-frame' })
    expect(row.status).toBe(201)
    rowId = String(row.body['id'])
    rowVersion = Number(row.body['version'])
    const note = await call(admin, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' })
    expect(note.status).toBe(201)
    noteId = String(note.body['id'])
    const customer = await call(admin, 'POST', '/api/customers', { name: `Refused frame ${stamp}` })
    const group = await call(admin, 'POST', '/api/groups', { name: `refused-frame-${stamp}` })
    expect((await call(admin, 'POST', `/api/groups/${String(group.body['id'])}/customers`, { customerId: customer.body['id'] })).status).toBeLessThan(300)
    expect((await call(admin, 'POST', `/api/groups/${String(group.body['id'])}/members`, { userId: reader.id, level: 'read' })).status).toBeLessThan(300)
    expect((await call(admin, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer.body['id'] })).status).toBe(200)
    expect((await call(reader, 'GET', `/api/cases/${caseId}`)).status).toBe(200)
  }, 120_000)

  afterAll(async () => { await h?.close() })

  it('records a refused claim and a refused prose edit as refusals naming the case', async () => {
    const from = new Date(Date.now() - 50)
    const frames: Record<string, unknown>[] = []
    const ws = new WebSocket(`${h.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
      headers: { cookie: reader.cookie, origin: h.origin },
    })
    ws.on('message', (raw: Buffer) => frames.push(JSON.parse(raw.toString()) as Record<string, unknown>))
    await new Promise<void>((ok, fail) => { ws.once('open', () => ok()); ws.once('error', fail) })
    await expect.poll(() => frames.length, { timeout: 10_000 }).toBeGreaterThan(0)

    ws.send(JSON.stringify({ type: 'claim', table: 'systems', id: rowId }))
    const doc = new Y.Doc()
    doc.getXmlFragment('note').insert(0, [new Y.XmlText('typed by a reader')])
    const enc = encoding.createEncoder()
    writeUpdate(enc, Y.encodeStateAsUpdate(doc))
    ws.send(JSON.stringify({
      type: 'prose.sync',
      field: `casenotes:${noteId}:document`,
      update: Buffer.from(encoding.toUint8Array(enc)).toString('base64'),
    }))
    await expect.poll(() => frames.filter((f) => f['type'] === 'claim.refused' || f['type'] === 'prose.refused').map((f) => `${String(f['type'])}:${String(f['reason'])}`).sort(), { timeout: 10_000 })
      .toEqual(['claim.refused:read-only', 'prose.refused:read-only'])
    await new Promise((r) => setTimeout(r, 1500))
    ws.terminate()

    const lines = await linesNamingCase(from)
    expect(lines.filter((l) => l.statusId === 2).map((l) => `${l.event} ${String(l.target)}`).sort()).toEqual([
      'access_denied live claim',
      'access_denied live prose.sync',
    ])
  }, 30_000)

  it('records the same reader writing the same case over HTTP as access_denied (the control)', async () => {
    const from = new Date(Date.now() - 50)
    const r = await call(reader, 'PATCH', `/api/cases/${caseId}/systems/${rowId}`, { version: rowVersion, hostname: 'x' })
    expect(r.status).toBe(403)
    await new Promise((res) => setTimeout(res, 500))
    const lines = await linesNamingCase(from)
    expect(lines.filter((l) => l.statusId === 2).map((l) => l.event)).toContain('access_denied')
  })
})
