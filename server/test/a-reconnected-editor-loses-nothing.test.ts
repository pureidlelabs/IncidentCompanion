/**
 * **The shipping socket client, dropped and returning, against the booted
 * install over a real `ws` socket.** `Link` and `ProseChannel` are the classes
 * the browser runs, so what they send on a reconnect is what is tested -- not a
 * frame sequence somebody wrote down from them.
 *
 * `slowJoin` holds each connection's preparation open for a fixed time before
 * it completes, so the window between the browser being told the socket is open
 * and the install being ready for it is wide enough to land in every time
 * rather than by luck.
 */
import net from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import { writeSyncStep1, writeUpdate } from 'y-protocols/sync'

import { acquireLink, releaseLink, type SocketLike } from '../../ui/src/api/caseSocket.js'
import { ProseChannel } from '../../ui/src/api/proseSync.js'
import { PresenceStore } from '../src/live/presence.store.js'
import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()
const pause = (ms: number) => new Promise((settle) => setTimeout(settle, ms))

/** How long a connection's preparation is held open, when it is. */
const SLOW_JOIN_MS = 200

describe.skipIf(!runnable)('an editor that drops and returns', () => {
  let harness: Harness
  let admin: Persona
  let analyst: Persona
  let slowJoin = true
  /** The address the browser believes it is served from. */
  let served = ''
  /** False while the network is down: every socket the client opens fails to connect. */
  let online = true
  const sockets: WebSocket[] = []
  /** The socket the editor's link has open, which is the one a drop cuts. */
  let editorSocket: WebSocket | null = null

  const call = async (who: Persona, method: string, path: string, body?: unknown) => {
    const response = await fetch(`${harness.base}${path}`, {
      method,
      headers: { cookie: who.cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
    served = harness.base
    ;(globalThis as { window?: unknown }).window = {
      get location() {
        return new URL(served)
      },
    }

    const store = harness.app.get(PresenceStore, { strict: false })
    const join = store.join.bind(store)
    store.join = async (...args: Parameters<typeof join>) => {
      if (slowJoin) await pause(SLOW_JOIN_MS)
      return join(...args)
    }
  }, 90_000)

  afterAll(async () => {
    for (const socket of sockets) socket.terminate()
    delete (globalThis as { window?: unknown }).window
    await harness?.close()
  })

  /** The browser's `WebSocket`, as the admin, through whatever `served` names. */
  const make = (url: string): SocketLike => {
    if (!online) {
      const down: SocketLike = {
        readyState: 3,
        send: () => undefined,
        close: () => undefined,
        onopen: null,
        onmessage: null,
        onclose: null,
      }
      setTimeout(() => down.onclose?.({} as CloseEvent), 0)
      return down
    }
    const live = new WebSocket(url, { headers: { cookie: admin.cookie, origin: harness.origin } })
    live.on('error', () => undefined)
    sockets.push(live)
    editorSocket = live
    return live as unknown as SocketLike
  }

  async function aNote(): Promise<{ caseId: string; id: string; field: string }> {
    const made = await call(admin, 'POST', '/api/cases', { title: `reconnect-${String(Date.now())}` })
    const caseId = String(made.body['id'])
    const note = await call(admin, 'POST', `/api/cases/${caseId}/casenotes`, { note: 'before the drop' })
    expect(note.status, JSON.stringify(note.body)).toBe(201)
    const id = String(note.body['id'])
    return { caseId, id, field: `casenotes:${id}:document` }
  }

  const stored = async (caseId: string, id: string) =>
    String((await call(admin, 'GET', `/api/cases/${caseId}/casenotes/${id}`)).body['note'])

  const typeInto = (channel: ProseChannel, text: string) => {
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText(text)])
    const fragment = channel.doc.getXmlFragment('note')
    fragment.insert(fragment.length, [paragraph])
  }

  const reads = (channel: ProseChannel) => channel.doc.getXmlFragment('note').toJSON()

  /** An editor open on the note, settled, over a link that is up. */
  async function editing(caseId: string, field: string) {
    const link = acquireLink(caseId, make)
    // Past the preparation, so the frames under test are the return's, not the first open's.
    let prepared = false
    const stop = link.subscribe((message) => {
      prepared ||= message['type'] === 'presence'
    })
    await expect.poll(() => prepared, { timeout: 10_000 }).toBe(true)
    stop()
    const channel = new ProseChannel(link, field, { user: { name: 'Returning analyst' } })
    await expect.poll(() => channel.status, { timeout: 10_000 }).toBe('ready')
    return { link, channel }
  }

  /** The network drops under the socket the link has open. */
  async function drop(link: { connected: boolean }) {
    editorSocket!.terminate()
    await expect.poll(() => link.connected, { timeout: 10_000 }).toBe(false)
  }

  function close(caseId: string, channel: ProseChannel) {
    channel.destroy()
    releaseLink(caseId)
  }

  it('keeps what was typed while down when the tab closes as soon as it is back', async () => {
    const { caseId, id, field } = await aNote()
    const { link, channel } = await editing(caseId, field)

    await drop(link)
    typeInto(channel, 'typed while down')
    await expect.poll(() => link.connected, { timeout: 10_000 }).toBe(true)
    // The analyst closes the tab the moment the connection is back.
    close(caseId, channel)

    await expect
      .poll(() => stored(caseId, id), { timeout: 10_000, message: 'what was typed offline never reached the record' })
      .toContain('typed while down')
  }, 30_000)

  it('receives what another analyst wrote while it was away, and merges what it wrote', async () => {
    const { caseId, id, field } = await aNote()
    const { link, channel } = await editing(caseId, field)
    const other = await anotherAnalystOn(caseId, field)

    online = false
    try {
      await drop(link)
      typeInto(channel, 'typed while down')
      other.write('written while the first analyst was away')
      await expect
        .poll(() => stored(caseId, id), { timeout: 10_000 })
        .toContain('written while the first analyst was away')
    } finally {
      online = true
    }
    await expect.poll(() => link.connected, { timeout: 15_000 }).toBe(true)

    // Nothing is typed after the return: what arrives is what the return itself asked for.
    await expect
      .poll(() => reads(channel), { timeout: 5_000, message: 'the returning editor never received the gap' })
      .toContain('written while the first analyst was away')
    await expect
      .poll(() => stored(caseId, id), { timeout: 10_000, message: 'what was typed offline did not merge' })
      .toContain('typed while down')

    other.close()
    close(caseId, channel)
  }, 45_000)

  it('makes a field opened before its connection is up ready', async () => {
    const { caseId, field } = await aNote()
    const link = acquireLink(caseId, make)
    // Built at once, beside the socket, as a screen mounting with the case does.
    const channel = new ProseChannel(link, field)
    expect(link.connected, 'the socket was already open, so this built nothing early').toBe(false)

    await expect
      .poll(() => channel.status, { timeout: 5_000, message: 'the field never left its loading state' })
      .toBe('ready')
    expect(reads(channel)).toContain('before the drop')

    close(caseId, channel)
  }, 30_000)

  /**
   * **Across a network delay, with the install's own preparation time and with
   * a slow one.** Whether a frame lands in the window depends on the round
   * trip against how long preparing the connection takes, so both are varied
   * and every combination is held to losing nothing.
   */
  it('loses nothing typed while down across network delays', async () => {
    const lost: string[] = []
    try {
      for (const slow of [false, true]) {
        for (const ms of [0, 1, 5, 20]) {
          slowJoin = slow
          const hop = await relay(Number(new URL(harness.base).port), ms)
          served = `http://127.0.0.1:${String(hop.port)}`
          try {
            const { caseId, id, field } = await aNote()
            const { link, channel } = await editing(caseId, field)
            await drop(link)
            typeInto(channel, `typed while down ${String(ms)}`)
            await expect.poll(() => link.connected, { timeout: 10_000 }).toBe(true)
            close(caseId, channel)
            const kept = await expect
              .poll(() => stored(caseId, id), { timeout: 5_000 })
              .toContain(`typed while down ${String(ms)}`)
              .then(() => true, () => false)
            if (!kept) lost.push(`${String(ms)}ms each way, ${slow ? 'slow' : 'ordinary'} preparation`)
          } finally {
            hop.close()
          }
        }
      }
    } finally {
      slowJoin = true
      served = harness.base
    }

    expect(lost, 'what was typed while down was lost').toEqual([])
  }, 120_000)

  /** A second analyst's socket, heard from before it writes, speaking the sync protocol by hand. */
  async function anotherAnalystOn(caseId: string, field: string) {
    const heard: string[] = []
    const live = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
      headers: { cookie: analyst.cookie, origin: harness.origin },
    })
    sockets.push(live)
    live.on('message', (raw: Buffer) => {
      heard.push(raw.toString())
    })
    await new Promise<void>((open, fail) => {
      live.once('open', () => {
        open()
      })
      live.once('error', fail)
    })
    await expect.poll(() => heard.length, { timeout: 10_000 }).toBeGreaterThan(0)

    const frame = <T>(write: (encoder: encoding.Encoder, value: T) => void, value: T) => {
      const encoder = encoding.createEncoder()
      write(encoder, value)
      return JSON.stringify({
        type: 'prose.sync',
        field,
        update: Buffer.from(encoding.toUint8Array(encoder)).toString('base64'),
      })
    }
    return {
      write(text: string) {
        const doc = new Y.Doc()
        const paragraph = new Y.XmlElement('paragraph')
        paragraph.insert(0, [new Y.XmlText(text)])
        doc.getXmlFragment('note').insert(0, [paragraph])
        live.send(frame(writeSyncStep1, doc))
        live.send(frame(writeUpdate, Y.encodeStateAsUpdate(doc)))
      },
      close() {
        live.close()
      },
    }
  }
})

/** A TCP hop that holds every chunk for `ms` in each direction: the network between a browser and the install. */
function relay(target: number, ms: number): Promise<{ port: number; close: () => void }> {
  const hop = net.createServer((client) => {
    const upstream = net.connect(target, '127.0.0.1')
    const pipe = (from: net.Socket, to: net.Socket) => {
      from.on('data', (chunk) => {
        setTimeout(() => {
          if (!to.destroyed) to.write(chunk)
        }, ms)
      })
    }
    pipe(client, upstream)
    pipe(upstream, client)
    const end = () => {
      setTimeout(() => {
        client.destroy()
        upstream.destroy()
      }, ms)
    }
    for (const side of [client, upstream]) {
      side.on('close', end)
      side.on('error', end)
    }
  })
  return new Promise((ready) => {
    hop.listen(0, '127.0.0.1', () => {
      ready({
        port: (hop.address() as net.AddressInfo).port,
        close: () => {
          hop.close()
        },
      })
    })
  })
}
