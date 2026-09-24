/**
 * **What a connection does with the frames it is sent**, over a real `ws`
 * socket against the booted install: every one is acted on, in the order it
 * was sent, and none is acted on when preparing the connection fails.
 *
 * The roster is read from the presence frames a second connection receives,
 * which is what another analyst's screen draws.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as encoding from 'lib0/encoding'
import { WebSocket } from 'ws'
import { writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import { PresenceStore } from '../src/live/presence.store.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()
const pause = (ms: number) => new Promise((settle) => setTimeout(settle, ms))

/** How long a connection's preparation is held open, so a frame sent on open lands inside it. */
const SLOW_JOIN_MS = 200

interface Claim {
  table: string
  entry_id: string
}

describe.skipIf(!runnable)('a connection acts on every frame, in order', () => {
  let harness: Harness
  let admin: Persona
  /** What the next preparation does before it completes: nothing, wait, or fail. */
  let preparing: 'ordinary' | 'slow' | 'failing' = 'ordinary'
  const sockets: WebSocket[] = []

  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const store = harness.app.get(PresenceStore, { strict: false })
    const join = store.join.bind(store)
    store.join = async (...args: Parameters<typeof join>) => {
      const mode = preparing
      // Failing late, so what the socket sent on open is already waiting when it does.
      if (mode !== 'ordinary') await pause(SLOW_JOIN_MS)
      if (mode === 'failing') throw new Error('preparing the connection failed')
      return join(...args)
    }
  }, 90_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await harness?.close()
  })

  async function aCase(): Promise<string> {
    const made = await call('POST', '/api/cases', { title: `frames-${String(Date.now())}` })
    return String(made.body['id'])
  }

  async function aRow(caseId: string, hostname: string): Promise<string> {
    const row = await call('POST', `/api/cases/${caseId}/systems`, { hostname })
    expect(row.status, JSON.stringify(row.body)).toBe(201)
    return String(row.body['id'])
  }

  /** A connection, open and heard from; `onOpen` runs the moment the socket opens, before anything arrives. */
  async function connect(caseId: string, onOpen: (live: WebSocket) => void = () => undefined) {
    const frames: Record<string, unknown>[] = []
    const live = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
      headers: { cookie: admin.cookie, origin: harness.origin },
    })
    sockets.push(live)
    live.on('message', (raw: Buffer) => {
      frames.push(JSON.parse(raw.toString()) as Record<string, unknown>)
    })
    live.on('error', () => undefined)
    const closed = new Promise<void>((done) => live.once('close', () => { done() }))
    await new Promise<void>((open, fail) => {
      live.once('open', () => {
        onOpen(live)
        open()
      })
      live.once('unexpected-response', (_request, response) => {
        fail(new Error(`refused ${String(response.statusCode)}`))
      })
    })
    return { live, frames, closed }
  }

  const heldIn = (frames: Record<string, unknown>[]): string[] =>
    ((frames.filter((frame) => frame['type'] === 'presence').at(-1)?.['claims'] ?? []) as Claim[]).map(
      (claim) => claim.entry_id,
    )

  /** Both sockets are one analyst, so the roster is one participant counting connections. */
  const connectionsIn = (frames: Record<string, unknown>[]): number =>
    ((frames.filter((frame) => frame['type'] === 'presence').at(-1)?.['roster'] ?? []) as { connections: number }[])
      .reduce((sum, participant) => sum + participant.connections, 0)

  it('acts on a claim sent the moment the connection opens', async () => {
    const caseId = await aCase()
    const row = await aRow(caseId, 'claimed-on-open')
    const watcher = await connect(caseId)
    await expect.poll(() => watcher.frames.length, { timeout: 10_000 }).toBeGreaterThan(0)

    preparing = 'slow'
    try {
      await connect(caseId, (live) => {
        live.send(JSON.stringify({ type: 'claim', table: 'systems', id: row }))
      })
      await expect
        .poll(() => heldIn(watcher.frames), { timeout: 5_000, message: 'the claim sent on open was dropped' })
        .toContain(row)
    } finally {
      preparing = 'ordinary'
    }
  }, 30_000)

  /**
   * **The claim is the frame that waits and the release the one that does
   * not**, so acting on the two side by side lets the release finish first and
   * the claim then lands on a row nobody is holding any more. A dialog opened
   * and closed at once sends exactly this pair.
   *
   * The sentinel is claimed last, so the roster that shows it is one drawn after
   * both frames of every pair were acted on.
   */
  it('leaves nothing held when a release is sent right behind its claim', async () => {
    const caseId = await aCase()
    const rows = await Promise.all([0, 1, 2, 3, 4].map((n) => aRow(caseId, `pair-${String(n)}`)))
    const sentinel = await aRow(caseId, 'sentinel')
    const { live, frames } = await connect(caseId)
    await expect.poll(() => frames.length, { timeout: 10_000 }).toBeGreaterThan(0)

    for (const row of rows) {
      live.send(JSON.stringify({ type: 'claim', table: 'systems', id: row }))
      live.send(JSON.stringify({ type: 'release', table: 'systems', id: row }))
    }
    live.send(JSON.stringify({ type: 'claim', table: 'systems', id: sentinel }))
    await expect.poll(() => heldIn(frames), { timeout: 10_000 }).toContain(sentinel)
    // Anything still in flight for a pair lands in this time and redraws the roster.
    await pause(500)

    expect(
      heldIn(frames).filter((held) => rows.includes(held)),
      'a release overtaken by its own claim left the row held',
    ).toEqual([])
  }, 30_000)

  it('acts on what follows a frame that is JSON and not an object, and still leaves', async () => {
    const caseId = await aCase()
    const row = await aRow(caseId, 'after-null')
    const watcher = await connect(caseId)
    await expect.poll(() => watcher.frames.length, { timeout: 10_000 }).toBeGreaterThan(0)

    const { live, closed } = await connect(caseId)
    for (const odd of ['null', '7', '"claim"', '[]', 'true']) live.send(odd)
    live.send(JSON.stringify({ type: 'claim', table: 'systems', id: row }))
    await expect
      .poll(() => heldIn(watcher.frames), { timeout: 5_000, message: 'a frame behind the odd one was dropped' })
      .toContain(row)

    live.close()
    await closed
    await expect
      .poll(() => connectionsIn(watcher.frames), { timeout: 5_000, message: 'the connection never left the roster' })
      .toBe(1)
    expect(heldIn(watcher.frames), 'the connection left its claim behind').toEqual([])
  }, 30_000)

  /** Prose rather than a claim: the roster hides a claim whose session never joined, so only prose can show it was acted on. */
  it('acts on nothing sent over a connection whose preparation fails', async () => {
    const caseId = await aCase()
    const note = await call('POST', `/api/cases/${caseId}/casenotes`, { note: 'as it was' })
    const id = String(note.body['id'])

    const typed = new Y.Doc()
    typed.getXmlFragment('note').insert(0, [new Y.XmlText('sent while it was being prepared')])
    const encoder = encoding.createEncoder()
    writeUpdate(encoder, Y.encodeStateAsUpdate(typed))
    const update = Buffer.from(encoding.toUint8Array(encoder)).toString('base64')

    preparing = 'failing'
    try {
      const failed = await connect(caseId, (live) => {
        live.send(JSON.stringify({ type: 'prose.sync', field: `casenotes:${id}:document`, update }))
      })
      await failed.closed
    } finally {
      preparing = 'ordinary'
    }

    // Past the flush a reader's departure triggers, had one been opened.
    await pause(1500)
    const stored = await call('GET', `/api/cases/${caseId}/casenotes/${id}`)
    expect(String(stored.body['note']), 'a frame on a connection that was never ready was acted on').not.toContain(
      'sent while it was being prepared',
    )
  }, 30_000)
})
