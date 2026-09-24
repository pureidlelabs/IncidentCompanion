/**
 * An open socket acts only while the session that opened it would be served an
 * ordinary request now, and ending one session ends only its own connections.
 *
 * Each way authority ends is tried on a socket that stays silent until after
 * the end, then writes: the write must not land, the socket must close, and
 * the refusal must be recorded as the request's would be.
 */
import { and, eq, gte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Redis } from 'ioredis'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { session, user } from '../src/db/schema/auth.js'
import { installActivity } from '../src/db/schema/install-activity.js'

const ISSUED = 'socket-issued-password-1234'
const CHOSEN = 'socket-chosen-password-1234'

let harness: Harness
let admin: Persona
let pool: ReturnType<typeof openTestPool>
let redis: Redis
let caseId = ''
const opened: WebSocket[] = []

const tokenOf = (cookie: string) => decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? ''

async function freshAnalyst(tag: string): Promise<Persona> {
  const email = `socket-${tag}-${String(process.pid)}@harness.test`
  const made = await fetch(`${harness.base}/api/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify({ username: email, displayName: `Socket ${tag}`, password: ISSUED, role: 'analyst' }),
  })
  expect(made.ok, `create ${email}: ${String(made.status)}`).toBe(true)
  const held = await signIn(harness, email, ISSUED)
  const changed = await fetch(`${harness.base}/api/change-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: held.cookie, origin: harness.origin },
    body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
  })
  expect(changed.ok, `change-password for ${email}: ${String(changed.status)}`).toBe(true)
  return signIn(harness, email, CHOSEN)
}

async function newNote(): Promise<string> {
  const made = await fetch(`${harness.base}/api/cases/${caseId}/casenotes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie, origin: harness.origin },
    body: JSON.stringify({ note: 'seeded by the administrator' }),
  })
  expect(made.ok).toBe(true)
  return ((await made.json()) as { id: string }).id
}

async function noteText(noteId: string): Promise<string> {
  const read = await fetch(`${harness.base}/api/cases/${caseId}/casenotes/${noteId}`, {
    headers: { cookie: admin.cookie },
  })
  return ((await read.json()) as { note?: string }).note ?? ''
}

/** An admitted socket, and the close code it ends with, once it ends. */
async function socketFor(cookie: string): Promise<{ socket: WebSocket; closed: Promise<number> }> {
  const socket = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
    headers: { cookie, origin: harness.origin },
  })
  opened.push(socket)
  socket.on('error', () => undefined)
  const closed = new Promise<number>((resolve) => socket.once('close', (code) => { resolve(code) }))
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => { resolve() })
    socket.once('unexpected-response', (_q, res) => { reject(new Error(`refused ${String(res.statusCode)}`)) })
  })
  return { socket, closed }
}

function typed(noteId: string, text: string): string {
  const doc = new Y.Doc()
  doc.getXmlFragment('note').insert(0, [new Y.XmlText(text)])
  const encoder = encoding.createEncoder()
  writeUpdate(encoder, Y.encodeStateAsUpdate(doc))
  return JSON.stringify({
    type: 'prose.sync',
    field: `casenotes:${noteId}:document`,
    update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64'),
  })
}

/** Resolves with the close code, or with `null` if the socket is still open after `ms`. */
const closesWithin = (closed: Promise<number>, ms: number) =>
  Promise.race([closed, new Promise<null>((resolve) => setTimeout(() => { resolve(null) }, ms))])

/** The refused connections recorded for the case since `since`, by what ended them, whoever the actor is now. */
async function endingsSince(since: Date): Promise<(string | null)[]> {
  const db = drizzle({ client: pool })
  const rows = await db
    .select({ target: installActivity.targetLabel })
    .from(installActivity)
    .where(
      and(
        eq(installActivity.event, 'live_refused'),
        gte(installActivity.at, since),
        sql`${installActivity.detail}->>'case' = ${caseId}`,
      ),
    )
  return rows.map((row) => row.target)
}

describe.skipIf(!(await bootable()))('a socket and the authority that admitted it', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    pool = openTestPool(process.env['SEED_DATABASE_URL'] ?? process.env['DATABASE_URL']!, 'ic_seed')
    redis = new Redis(process.env['REDIS_URL']!)
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie, origin: harness.origin },
      body: JSON.stringify({ title: `Socket authority ${String(process.pid)}` }),
    })
    caseId = ((await made.json()) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    for (const socket of opened) socket.terminate()
    await redis?.quit()
    await pool?.end()
    await harness?.close()
  })

  const ends: [string, (analyst: Persona) => Promise<void>][] = [
    [
      'its session window closes',
      async (analyst) => {
        const token = tokenOf(analyst.cookie)
        await drizzle({ client: pool })
          .update(session)
          .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
          .where(eq(session.token, token))
        await redis.del(`auth:${token}`)
      },
    ],
    [
      'an administrator resets the password and holds the account',
      async (analyst) => {
        const reset = await fetch(`${harness.base}/api/accounts/${encodeURIComponent(analyst.email)}/reset`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: admin.cookie, origin: harness.origin },
          body: JSON.stringify({ password: 'socket-reset-password-1234' }),
        })
        expect(reset.ok, `reset: ${String(reset.status)}`).toBe(true)
      },
    ],
    [
      'an administrator disables the account, which bans before its line is written',
      async (analyst) => {
        const disabled = await fetch(`${harness.base}/api/accounts/${encodeURIComponent(analyst.email)}/disable`, {
          method: 'POST',
          headers: { cookie: admin.cookie, origin: harness.origin },
        })
        expect(disabled.ok, `disable: ${String(disabled.status)}`).toBe(true)
      },
    ],
    [
      'its account is deleted beneath the library',
      async (analyst) => {
        await drizzle({ client: pool }).delete(user).where(eq(user.id, analyst.id))
      },
    ],
  ]

  it.each(ends)('stops writing and closes once %s', async (what, end) => {
    const analyst = await freshAnalyst(what.replace(/\W+/g, '-').slice(0, 24))
    const noteId = await newNote()
    const { socket, closed } = await socketFor(analyst.cookie)
    const since = new Date(Date.now() - 1000)

    await end(analyst)
    socket.send(typed(noteId, `written after ${what}`))
    const code = await closesWithin(closed, 5_000)
    await new Promise((resolve) => setTimeout(resolve, 1_000))

    expect({
      written: (await noteText(noteId)).includes(`written after ${what}`),
      closed: code !== null,
      recorded: (await endingsSince(since)).length > 0,
    }).toEqual({ written: false, closed: true, recorded: true })
  }, 60_000)

  it.each([
    ['its holder signs out', async (analyst: Persona) => {
      const out = await fetch(`${harness.base}/api/auth/sign-out`, {
        method: 'POST',
        headers: { cookie: analyst.cookie, origin: harness.origin },
      })
      expect(out.ok).toBe(true)
    }],
    ['an administrator ends its sessions', async (analyst: Persona) => {
      const ended = await fetch(`${harness.base}/api/accounts/${encodeURIComponent(analyst.email)}/sessions/end`, {
        method: 'POST',
        headers: { cookie: admin.cookie, origin: harness.origin },
      })
      expect(ended.ok, `sessions/end: ${String(ended.status)}`).toBe(true)
    }],
  ] as const)('closes without writing a refusal of its own once %s, which is already recorded', async (what, end) => {
    const analyst = await freshAnalyst(what.replace(/\W+/g, '-').slice(0, 24))
    const { closed } = await socketFor(analyst.cookie)
    const since = new Date(Date.now() - 1000)

    await end(analyst)

    expect(await closesWithin(closed, 5_000)).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await endingsSince(since)).toEqual([])
  }, 60_000)

  it('closes a silent socket whose session window closed, within the sweep', async () => {
    const analyst = await freshAnalyst('silent')
    const { closed } = await socketFor(analyst.cookie)
    const token = tokenOf(analyst.cookie)
    await drizzle({ client: pool })
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(session.token, token))
    await redis.del(`auth:${token}`)

    expect(await closesWithin(closed, 20_000), 'a socket that sent nothing outlived its session').toBe(4401)
  }, 60_000)

  it('ends only the connections of the session that ended', async () => {
    const analyst = await freshAnalyst('two-places')
    const elsewhere = await signIn(harness, analyst.email, CHOSEN)
    const noteId = await newNote()
    const first = await socketFor(analyst.cookie)
    const second = await socketFor(elsewhere.cookie)

    const out = await fetch(`${harness.base}/api/auth/sign-out`, {
      method: 'POST',
      headers: { cookie: analyst.cookie, origin: harness.origin },
    })
    expect(out.ok).toBe(true)
    second.socket.send(typed(noteId, 'written from the place still signed in'))

    expect(await closesWithin(first.closed, 5_000), 'the signed-out place kept its socket').not.toBeNull()
    expect(await closesWithin(second.closed, 1_000), 'the other place lost its socket').toBeNull()
    await expect.poll(async () => noteText(noteId), { timeout: 5_000 }).toContain('written from the place still signed in')
  }, 60_000)
})
