/**
 * A caret another analyst sees over the live connection names the analyst the
 * install admitted, and only the connection that announced a caret moves it.
 *
 * **The attack is a reader writing awareness frames by hand**: one naming
 * another analyst, and one reusing another analyst's client id at a higher
 * clock, which every browser applies over the real caret.
 */
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'
import { issued, pause } from './case-socket.js'
import { caller, Live, type Frame } from './report-writers.js'

const TAG = `${String(process.pid)}-${String(Date.now()).slice(-6)}`

let harness: Harness | undefined
let admin: Persona
let writer: Persona
let reader: Persona
let caseId = ''
let field = ''
const open: Live[] = []

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

/** One awareness entry, framed as `encodeAwarenessUpdate` frames it. */
function entry(client: number, clock: number, state: unknown): string {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 1)
  encoding.writeVarUint(encoder, client)
  encoding.writeVarUint(encoder, clock)
  encoding.writeVarString(encoder, JSON.stringify(state))
  return b64(encoding.toUint8Array(encoder))
}

/** The client ids every awareness frame `live` heard carried. */
function clientsIn(frames: Frame[]): number[] {
  const seen: number[] = []
  for (const frame of frames.filter((one) => one.type === 'prose.awareness')) {
    const decoder = decoding.createDecoder(Buffer.from(frame.update ?? '', 'base64'))
    const count = decoding.readVarUint(decoder)
    for (let i = 0; i < count; i += 1) {
      seen.push(decoding.readVarUint(decoder))
      decoding.readVarUint(decoder)
      decoding.readVarString(decoder)
    }
  }
  return seen
}

/** The carets `live` draws, applying every awareness frame it heard as a browser does. */
function carets(live: Live): Map<number, { user?: { name?: string } } | undefined> {
  const drawn = new Awareness(new Y.Doc())
  for (const frame of live.frames.filter((one) => one.type === 'prose.awareness')) {
    applyAwarenessUpdate(drawn, Buffer.from(frame.update ?? '', 'base64'), 'remote')
  }
  const states = new Map(drawn.getStates() as Map<number, { user?: { name?: string } }>)
  drawn.destroy()
  return states
}

/** An editor on `field`, announcing a caret under `name` as the browser does. */
async function editor(who: Persona, name: string): Promise<{ live: Live; client: number }> {
  const live = await Live.open(harness!, who, caseId)
  open.push(live)
  const doc = new Y.Doc()
  await live.openField(field, doc)
  const awareness = new Awareness(doc)
  awareness.setLocalStateField('user', { name })
  live.send({ type: 'prose.awareness', field, update: b64(encodeAwarenessUpdate(awareness, [doc.clientID])) })
  awareness.destroy()
  return { live, client: doc.clientID }
}

describe.skipIf(!(await bootable()))('a caret drawn from the live connection', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const call = caller(harness, admin)
    const post = async (path: string, body: unknown) => {
      const answer = await call(path, 'POST', body)
      expect(answer.status, `POST ${path}`).toBeLessThan(300)
      return (await answer.json()) as { id: string }
    }
    const customer = (await post('/customers', { name: `Carets ${TAG}` })).id
    const group = (await post('/groups', { name: `Carets ${TAG}` })).id
    await post(`/groups/${group}/customers`, { customerId: customer })
    writer = await issued(harness, admin, 'Caret Writer', `caret-writer-${TAG}@example.invalid`)
    reader = await issued(harness, admin, 'Caret Reader', `caret-reader-${TAG}@example.invalid`)
    await post(`/groups/${group}/members`, { userId: writer.id, level: 'write' })
    await post(`/groups/${group}/members`, { userId: reader.id, level: 'read' })
    await post(`/groups/${group}/members`, { userId: admin.id, level: 'write' })
    caseId = (await post('/cases', { title: `Carets ${TAG}` })).id
    expect((await call(`/cases/${caseId}/customer`, 'PUT', { customerId: customer })).status).toBe(200)
    field = `casenotes:${(await post(`/cases/${caseId}/casenotes`, { note: 'seed' })).id}:document`
  }, 120_000)

  afterAll(async () => {
    await Promise.all(open.map((live) => live.close()))
    await harness?.close()
  })

  it('shows the others the name of the analyst who sent it, whatever name it carried', async () => {
    const watching = await editor(admin, 'watching')
    await editor(reader, 'Caret Writer')
    await pause(500)

    const names = [...carets(watching.live).values()].map((state) => state?.user?.name)
    expect(names).toContain('Caret Reader')
    expect(names).not.toContain('Caret Writer')
  })

  it('leaves a caret another connection announced where it was, and relays nothing sent for it', async () => {
    const watching = await editor(admin, 'watching')
    const victim = await editor(writer, 'Caret Writer')
    const forger = await editor(reader, 'Caret Reader')
    await pause(500)
    const heard = watching.live.frames.length

    forger.live.send({
      type: 'prose.awareness',
      field,
      update: entry(victim.client, 1000, { user: { name: 'Caret Writer (typing: DELETE THIS SECTION)' } }),
    })
    await pause(500)

    expect(clientsIn(watching.live.frames.slice(heard))).not.toContain(victim.client)
    expect(carets(watching.live).get(victim.client)?.user?.name).toBe('Caret Writer')
  })

  it('keeps a caret for its analyst across a reconnect, whoever announces it in between', async () => {
    const watching = await editor(admin, 'watching')
    const victim = await editor(writer, 'Caret Writer')
    const forger = await editor(reader, 'Caret Reader')
    await pause(300)
    await victim.live.close()
    await pause(300)
    const heard = watching.live.frames.length
    forger.live.send({ type: 'prose.awareness', field, update: entry(victim.client, 1000, { user: { name: 'x' } }) })
    await pause(300)
    const back = await Live.open(harness!, writer, caseId)
    open.push(back)
    back.send({ type: 'prose.awareness', field, update: entry(victim.client, 1001, { user: { name: 'Caret Writer' } }) })
    await pause(500)

    expect({
      relayed: clientsIn(watching.live.frames.slice(heard)).filter((one) => one === victim.client).length,
      drawn: carets(watching.live).get(victim.client)?.user?.name,
    }).toEqual({ relayed: 1, drawn: 'Caret Writer' })
  })

  it('holds nothing for an update it could not read', async () => {
    const watching = await editor(admin, 'watching')
    const forger = await editor(reader, 'Caret Reader')
    const planted = 4_000_000_000 + Math.floor(Math.random() * 1_000_000)
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, 2)
    encoding.writeVarUint(encoder, planted)
    encoding.writeVarUint(encoder, 1)
    encoding.writeVarString(encoder, JSON.stringify({ user: { name: 'x' } }))
    encoding.writeVarUint(encoder, planted + 1)
    encoding.writeVarUint(encoder, 1)
    encoding.writeVarString(encoder, 'not json')
    forger.live.send({ type: 'prose.awareness', field, update: b64(encoding.toUint8Array(encoder)) })
    await pause(300)
    const owner = await Live.open(harness!, writer, caseId)
    open.push(owner)
    owner.send({ type: 'prose.awareness', field, update: entry(planted, 1, { user: { name: 'Caret Writer' } }) })
    await pause(500)

    expect(carets(watching.live).get(planted)?.user?.name).toBe('Caret Writer')
  })
})
