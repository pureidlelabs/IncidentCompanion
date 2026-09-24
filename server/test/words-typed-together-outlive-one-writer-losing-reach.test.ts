/**
 * Words two analysts type into one note are kept when one of them loses write
 * before they are stored.
 *
 * > #### Scenario: One of the writers loses write before the words are stored
 * > - GIVEN two analysts writing in one passage
 * > - WHEN one of them loses write before what both typed is stored
 * > - THEN both sets of words are stored
 *
 * **The attack is a revocation inside the quiet moment.** Both analysts type
 * over the case socket, the second is lowered to read the moment the first has
 * seen their words, and the document is left to store itself and then to the
 * last reader leaving. The store is the one the server connects to, and every
 * door is the shipped one.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { writeSyncStep1, writeUpdate } from 'y-protocols/sync'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'
import { openTestPool } from './database.js'
import { caseNotes, cases, customers } from '../src/db/schema/index.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`
const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms))

let harness: Harness
let admin: Persona
let first: Persona
let last: Persona
let seedPool: ReturnType<typeof openTestPool>
let group = ''
let customer = ''
let caseId = ''
let noteId = ''
const sockets: WebSocket[] = []

const call = async (who: Persona, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${harness.base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: who.cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  expect(response.ok, `${method} ${path} answered ${String(response.status)}: ${text}`).toBe(true)
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>
}

/** An analyst the administrator issues, signed in with a password of their own. */
async function anAnalyst(name: string): Promise<Persona> {
  const email = `${name.toLowerCase().replaceAll(' ', '-')}-${TAG}@example.invalid`
  await call(admin, 'POST', '/api/accounts', {
    username: email,
    displayName: name,
    password: 'issued-password-1234',
    role: 'analyst',
  })
  const issued = await signIn(harness, email, 'issued-password-1234')
  await call(issued, 'POST', '/api/change-password', {
    current: 'issued-password-1234',
    password: 'their-own-password-1234',
    repeat: 'their-own-password-1234',
  })
  return signIn(harness, email, 'their-own-password-1234')
}

/** A live connection to the case, with every frame it has heard. */
async function connect(who: Persona) {
  const socket = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
    headers: { cookie: who.cookie, origin: harness.origin },
  })
  sockets.push(socket)
  const heard: { type?: string }[] = []
  socket.on('message', (raw: Buffer) => {
    heard.push(JSON.parse(raw.toString()) as { type?: string })
  })
  await new Promise<void>((opened, failed) => {
    socket.once('open', () => {
      opened()
    })
    socket.once('error', failed)
  })
  for (let tries = 0; tries < 100 && !heard.some((one) => one.type === 'presence'); tries += 1) {
    await pause(50)
  }
  return { socket, heard }
}

/** What an editor opening a document asks first: everything, since it holds nothing. */
function asked(): string {
  const encoder = encoding.createEncoder()
  writeSyncStep1(encoder, new Y.Doc())
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

/** One analyst's keystrokes, framed as the editor sends them. */
function typed(text: string): string {
  const doc = new Y.Doc({ gc: false })
  let update: Uint8Array | null = null
  doc.on('update', (made: Uint8Array) => {
    update = made
  })
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  doc.getXmlFragment('note').push([paragraph])
  const encoder = encoding.createEncoder()
  writeUpdate(encoder, update!)
  return Buffer.from(encoding.toUint8Array(encoder)).toString('base64')
}

const stored = async () => {
  const [row] = await drizzle({ client: seedPool })
    .select({ note: caseNotes.note })
    .from(caseNotes)
    .where(eq(caseNotes.id, noteId))
  return row!.note
}

describe.skipIf(!(await bootable()))('two analysts writing one note, one losing write', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    first = await anAnalyst('First writer')
    last = await anAnalyst('Last writer')
    seedPool = openTestPool(process.env['SEED_DATABASE_URL']!, 'ic_seed')

    customer = (await call(admin, 'POST', '/api/customers', { name: `Written by two ${TAG}` }))[
      'id'
    ] as string
    group = (await call(admin, 'POST', '/api/groups', { name: `Both write ${TAG}` }))['id'] as string
    await call(admin, 'POST', `/api/groups/${group}/customers`, { customerId: customer })
    for (const who of [first, last]) {
      await call(admin, 'POST', `/api/groups/${group}/members`, { userId: who.id, level: 'write' })
    }
    caseId = (await call(first, 'POST', '/api/cases', { title: `Written by two ${TAG}` }))[
      'id'
    ] as string
    await call(first, 'PUT', `/api/cases/${caseId}/customer`, { customerId: customer })
    noteId = (await call(first, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'seed' }))[
      'id'
    ] as string
  }, 120_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    await pause(300)
    const db = drizzle({ client: seedPool })
    await db.delete(cases).where(eq(cases.id, caseId))
    await db.delete(customers).where(eq(customers.id, customer))
    await seedPool?.end()
    await harness?.close()
  })

  it('stores both sets of words through the analyst who still writes', async () => {
    const field = `casenotes:${noteId}:document`
    const one = await connect(first)
    const two = await connect(last)

    // Both open the note before either types, so each hears the other at once
    // and both edits fall inside one quiet moment.
    for (const { socket } of [one, two]) {
      socket.send(JSON.stringify({ type: 'prose.sync', field, update: asked() }))
    }
    const syncs = (heard: { type?: string }[]) => heard.filter((f) => f.type === 'prose.sync').length
    const until = async (done: () => boolean) => {
      for (let tries = 0; tries < 200 && !done(); tries += 1) await pause(5)
      expect(done(), 'a frame the server should have answered was never heard').toBe(true)
    }
    await until(() => syncs(one.heard) > 0 && syncs(two.heard) > 0)

    // Hearing the other's words is the server having taken them.
    const secondHeard = syncs(two.heard)
    one.socket.send(JSON.stringify({ type: 'prose.sync', field, update: typed('typed by the first') }))
    await until(() => syncs(two.heard) > secondHeard)
    const firstHeard = syncs(one.heard)
    two.socket.send(JSON.stringify({ type: 'prose.sync', field, update: typed('typed by the last') }))
    await until(() => syncs(one.heard) > firstHeard)
    await call(admin, 'POST', `/api/groups/${group}/members`, { userId: last.id, level: 'read' })
    expect(await stored(), 'the words were stored before the revocation, so this proves nothing').toBe(
      'seed',
    )

    await pause(1_500)
    one.socket.close()
    await pause(500)

    const note = await stored()
    expect(note, 'the words were dropped with the writer who lost write').toContain(
      'typed by the first',
    )
    expect(note).toContain('typed by the last')
  })
})
