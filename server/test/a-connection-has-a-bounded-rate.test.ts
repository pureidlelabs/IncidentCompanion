/**
 * The case socket bounds how many connections an analyst holds and opens, how
 * many refused upgrades one address can make, and how much one connection
 * sends -- and the application's own client, used hard, meets none of it.
 *
 * **The attacks are the ones measured on 71b4267c**: 200 upgrades by one
 * analyst at once, a reader pacing 60 KB frames under the queue cap, and 300
 * anonymous upgrades writing one audit line each.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, gte, sql } from 'drizzle-orm'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { asked, issued, pause, typed } from './case-socket.js'
import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installActivity } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`

let harness: Harness
let admin: Persona
let caseId = ''
let noteId = ''
const sockets: WebSocket[] = []

const post = async (path: string, body: unknown) => {
  const answer = await fetch(`${harness.base}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.cookie },
    body: JSON.stringify(body),
  })
  expect(answer.status, `POST ${path}`).toBeLessThan(300)
  return (await answer.json()) as { id: string }
}

/** How an upgrade ended: opened, refused with a status, or closed with a code. */
interface Upgrade {
  socket: WebSocket
  answered: Promise<number | 'open'>
  closed: Promise<number>
  heardBytes: () => number
}

function upgrade(who: Persona | null, path = `/api/cases/${caseId}/live`): Upgrade {
  const socket = new WebSocket(`${harness.base.replace('http://', 'ws://')}${path}`, {
    headers: { origin: harness.origin, ...(who ? { cookie: who.cookie } : {}) },
  })
  sockets.push(socket)
  let bytes = 0
  socket.on('message', (raw: Buffer) => {
    bytes += raw.length
  })
  socket.on('error', () => {})
  const answered = new Promise<number | 'open'>((done) => {
    socket.once('open', () => done('open'))
    socket.once('unexpected-response', (request, response) => {
      request.on('error', () => {})
      done(response.statusCode ?? 0)
      request.destroy()
    })
    socket.once('error', () => done(0))
  })
  const closed = new Promise<number>((done) => socket.once('close', (code) => done(code)))
  return { socket, answered, closed, heardBytes: () => bytes }
}

const lines = (event: 'case_opened_live' | 'live_refused' | 'rate_limited', from: Date, actorId?: string) =>
  harness.app
    .get<Database>(DATABASE)
    .select({ n: sql<number>`count(*)::int` })
    .from(installActivity)
    .where(
      and(
        eq(installActivity.event, event),
        gte(installActivity.at, from),
        ...(actorId ? [eq(installActivity.actorId, actorId)] : []),
      ),
    )
    .then((rows) => rows[0]!.n)

/**
 * `n` upgrades, in waves no deeper than a listen backlog: past it the host
 * resets the connect itself, and nothing about the socket is measured.
 */
async function inWaves(n: number, make: () => Upgrade): Promise<{ all: Upgrade[]; answers: (number | 'open')[] }> {
  const all: Upgrade[] = []
  const answers: (number | 'open')[] = []
  while (all.length < n) {
    const wave = Array.from({ length: Math.min(50, n - all.length) }, make)
    all.push(...wave)
    answers.push(...(await Promise.all(wave.map((one) => one.answered))))
  }
  return { all, answers }
}

let count = 0
async function anAnalyst(): Promise<Persona> {
  count += 1
  const who = await issued(harness, admin, `Rate ${String(count)}`, `rate-${String(count)}-${TAG}@example.invalid`)
  return who
}

describe.skipIf(!(await bootable()))('a connection to the case, at a rate', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    caseId = (await post('/cases', { title: `Rate ${TAG}` })).id
    noteId = (await post(`/cases/${caseId}/casenotes`, { note: 'seed' })).id
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    await harness?.close()
  })

  it('admits a bounded number of one analyst\'s upgrades made at once, and records each refusal once', async () => {
    const who = await anAnalyst()
    const from = new Date(Date.now() - 50)
    const { all, answers } = await inWaves(200, () => upgrade(who))
    await pause(1_000)

    const admitted = answers.filter((one) => one === 'open').length
    expect({
      someAdmitted: admitted > 0,
      boundedAdmitted: admitted <= 32,
      restRefused: answers.filter((one) => one === 429).length === 200 - admitted,
      opened: (await lines('case_opened_live', from, who.id)) === admitted,
      limitedLines: (await lines('rate_limited', from)) <= 2,
    }).toEqual({ someAdmitted: true, boundedAdmitted: true, restRefused: true, opened: true, limitedLines: true })
    for (const one of all) one.socket.terminate()
  })

  it('refuses anonymous upgrades past a bound per address, and writes a bounded number of lines', async () => {
    const from = new Date(Date.now() - 50)
    const { answers } = await inWaves(300, () => upgrade(null, `/api/cases/${randomUUID()}/live`))
    await pause(1_000)

    const refused = answers.filter((one) => one === 401).length
    expect({
      someHeardWhy: refused > 0,
      restLimited: answers.filter((one) => one === 429).length === 300 - refused,
      refusalLines: (await lines('live_refused', from)) === refused && refused <= 30,
      limitedLines: (await lines('rate_limited', from)) <= 1,
    }).toEqual({ someHeardWhy: true, restLimited: true, refusalLines: true, limitedLines: true })
  })

  it('ends a connection that sends past its budget, before much of it reaches anybody', async () => {
    const reader = await anAnalyst()
    const watching = upgrade(admin)
    expect(await watching.answered).toBe('open')
    const flooding = upgrade(reader)
    expect(await flooding.answered).toBe('open')

    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    // Just under the frame bound once base64 has grown it by a third.
    awareness.setLocalStateField('user', { name: 'x', pad: 'x'.repeat(45 * 1024) })
    const frame = JSON.stringify({
      type: 'prose.awareness',
      field: `casenotes:${noteId}:document`,
      update: Buffer.from(encodeAwarenessUpdate(awareness, [doc.clientID])).toString('base64'),
    })
    expect(frame.length).toBeLessThan(64 * 1024)
    // 20 frames every 50 ms: the pace that stayed under the queue cap and was never stopped.
    const pacing = setInterval(() => {
      if (flooding.socket.readyState !== WebSocket.OPEN) return
      for (let i = 0; i < 20; i += 1) flooding.socket.send(frame)
    }, 50)
    const code = await Promise.race([flooding.closed, pause(10_000).then(() => 'still open')])
    clearInterval(pacing)
    awareness.destroy()

    expect({ code, heard: watching.heardBytes() < 8 * 1024 * 1024 }).toEqual({ code: 4429, heard: true })
  }, 20_000)

  it('never limits the application\'s own client, used hard', async () => {
    const who = await anAnalyst()
    const field = `casenotes:${noteId}:document`
    const answers: (number | 'open')[] = []
    const codes: number[] = []

    // Five tabs, each dropping and returning at the client's first backoff, ten times.
    for (let round = 0; round < 10; round += 1) {
      const tabs = Array.from({ length: 5 }, () => upgrade(who))
      answers.push(...(await Promise.all(tabs.map((one) => one.answered))))
      const typing = tabs[0]!
      typing.closed.then((one) => codes.push(one), () => {})
      // A reconnecting editor with a hundred documents open: a state request,
      // its whole state and a caret for each, in one burst.
      for (let i = 0; i < 100; i += 1) {
        typing.socket.send(JSON.stringify({ type: 'prose.sync', field, update: asked() }))
        typing.socket.send(JSON.stringify({ type: 'prose.sync', field, update: typed('x'.repeat(4_000)) }))
        const caret = new Awareness(new Y.Doc())
        caret.setLocalStateField('user', { name: 'Rate' })
        typing.socket.send(
          JSON.stringify({ type: 'prose.awareness', field, update: Buffer.from(encodeAwarenessUpdate(caret, [caret.clientID])).toString('base64') }),
        )
        caret.destroy()
      }
      // Then a fast typist: a keystroke and a caret move every 25 ms.
      for (let i = 0; i < 20; i += 1) {
        typing.socket.send(JSON.stringify({ type: 'prose.sync', field, update: typed('k') }))
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, 0)
        typing.socket.send(JSON.stringify({ type: 'prose.awareness', field, update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64') }))
        await pause(25)
      }
      for (const tab of tabs) tab.socket.close()
      await pause(500)
    }

    expect({ refused: answers.filter((one) => one !== 'open'), limited: codes.filter((one) => one === 4429) })
      .toEqual({ refused: [], limited: [] })
  }, 60_000)
})
