/**
 * The socket handshake, attacked: cross-site hijacking (handshakes are not
 * subject to CORS) and IDOR (authenticated, then trusting the uuid in the
 * path). Nothing else can see either - no guard, pipe or middleware runs on an
 * `upgrade`, so a missing check looks exactly like a present one.
 *
 * **Driven through `check()` and `open()` with a fake socket, never a live
 * one**, so nothing here covers the upgrade plumbing itself: the decisions are
 * the part with the security in them.
 *
 * The prose frames are here because the second boundary this file guards is
 * not in the handshake at all - a filed report is frozen at every collection
 * door and was still editable word by word over this socket.
 */
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'

import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { Logger } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket as Client, type WebSocket } from 'ws'
import { readSyncMessage } from 'y-protocols/sync'
import * as Y from 'yjs'

import { LiveGateway } from './live.gateway.js'
import { ProseService } from '../prose/prose.service.js'
import type { CaseChannel } from './case-channel.service.js'
import { sessionEnded } from '../auth/session-ended.js'
import { reachChanged } from '../access/reach-changed.js'

/** An auth library answering every read with one live session, `s-1`, which the fake admissions carry. */
const SIGNED_IN = {
  api: { getSession: () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }) },
}

const CASE = '11111111-1111-4111-8111-111111111111'
/** A second well-formed id, for the refusals a caller varies. Distinct from
 *  `GHOST` on purpose: sharing a value makes one test's fixture the other's. */
const OTHER = '33333333-3333-4333-8333-333333333333'
const GHOST = '22222222-2222-4222-8222-222222222222'

/**
 * What the socket wrote to the audit, per test.
 *
 * **A recorder rather than a stub.** `record` is called on both branches of
 * the upgrade -- once for a refusal and once for an opening -- and an empty
 * object throws on the first of them, so no case reaching either path can be
 * written against one. Cleared by `beforeEach`.
 */
const recorded: {
  event: string
  outcome?: string
  target?: unknown
  detail?: Record<string, string> | undefined
}[] = []
const audit = {
  record: (line: {
    event: string
    outcome?: string
    target?: unknown
    detail?: Record<string, string> | undefined
  }) => {
    recorded.push(line)
    return Promise.resolve()
  },
}

beforeEach(() => {
  recorded.length = 0
})

/** The origins the auth library enforces for this stand-in install. */
const INSTALL = {
  options: { trustedOrigins: ['http://localhost:5174', 'https://localhost:8443'] },
}


function gatewayWith(
  options: { signedIn?: boolean; caseExists?: boolean; held?: boolean; sessionless?: boolean } = {},
) {
  const { signedIn = true, caseExists = true, held = false, sessionless = false } = options

  const auth = {
    instance: INSTALL,
    api: {
      getSession: () =>
        Promise.resolve(
          signedIn
            ? {
                user: {
                  id: 'u-1',
                  name: 'Ada',
                  email: 'a@b.test',
                  ...(held ? { mustChangePassword: true } : {}),
                },
                ...(sessionless ? {} : { session: { id: 's-1' } }),
              }
            : null,
        ),
    },
  }
  return new LiveGateway(
    {} as CaseChannel,
    auth as never,
    // The gateway's prose half is not what these cases drive; a stand-in keeps
    // the constructor honest rather than the argument list short.
    {} as never,
    // **Recording, not empty.** The socket audits itself because nothing else
    // can -- no guard, pipe, middleware or interceptor runs on an upgrade --
    // and an empty object would make `this.activity.record` throw the moment a
    // case drove the upgrade path rather than the verdict.
    audit as never,
    caseExists ? anyoneReaches : reachesNothing,
  )
}

const request = (
  url: string,
  headers: Record<string, string> = { origin: 'http://localhost:5174', host: 'localhost:5174' },
) => ({ url, headers, socket: { remoteAddress: '127.0.0.1' } }) as unknown as IncomingMessage

/**
 * A reach stand-in that admits every case, at write.
 *
 * **These cases are not about reach**, and none of them builds a customer or a
 * group -- so the question `levelOnCase` asks is answered `write` here and the
 * refusals below stay the ones each case is actually driving. What reach
 * refuses is asserted in `the-socket-asks-reach-too.test.ts`, against real
 * rows.
 */
const anyoneReaches = {
  levelOnCase: () => Promise.resolve({ customerId: 'a-default-customer', level: 'write' as const }),
} as never

/** The same stand-in for a case that is not there, which `levelOnCase` answers with nothing. */
const reachesNothing = { levelOnCase: () => Promise.resolve(null) } as never

describe('what the handshake lets through', () => {
  it('admits a signed-in analyst, same origin, on a case that exists', async () => {
    const verdict = await gatewayWith().check(request(`/api/cases/${CASE}/live`))
    expect(verdict).toMatchObject({ refused: null, caseId: CASE })
  })
})

describe("the install's own origins", () => {
  /**
   * **The set sign-in admits, whatever `Host` says.** The edge forwards the
   * browser's `Host`, so a comparison against it admits the unprotected
   * spelling of the install; membership of the trusted set does not.
   */
  it('admits the install at its published port', async () => {
    const verdict = await gatewayWith().check(
      request(`/api/cases/${CASE}/live`, {
        origin: 'https://localhost:8443',
        host: 'localhost:8443',
      }),
    )
    expect(verdict).toMatchObject({ refused: null })
  })

  it('refuses the unprotected spelling of the install, although Host matches it', async () => {
    const verdict = await gatewayWith().check(
      request(`/api/cases/${CASE}/live`, {
        origin: 'http://localhost:8443',
        host: 'localhost:8443',
      }),
    )
    expect(verdict.refused).toBe('cross-origin')
  })
})

/**
 * Drive a real upgrade through `attach`, which is the only door to the private
 * method that audits.
 *
 * The suite around this drives `check`, which decides; nothing drove the path
 * that *acts on* the decision, and both audit lines live there. A refused
 * upgrade is the half worth holding: it is an authorisation failure, and the
 * one kind the HTTP boundary never sees at all.
 */
async function driveUpgrade(gateway: LiveGateway, url: string, headers?: Record<string, string>) {
  let handler: ((r: unknown, s: unknown, h: unknown) => void) | null = null
  gateway.attach({
    on: (event: string, cb: (r: unknown, s: unknown, h: unknown) => void) => {
      if (event === 'upgrade') handler = cb
    },
  } as never)
  expect(handler, 'attach registered no upgrade handler').not.toBeNull()

  const written: string[] = []
  let destroyed = false
  const socket = {
    write: (line: string) => written.push(line),
    destroy: () => {
      destroyed = true
    },
  }
  ;(handler as unknown as (r: unknown, s: unknown, h: unknown) => void)(
    request(url, headers),
    socket,
    Buffer.alloc(0),
  )
  // The handler is sync and the work inside it is not; one macrotask turn
  // settles it, because every lookup under it is already resolved.
  await new Promise((resolve) => setImmediate(resolve))
  return { written, destroyed }
}

describe('what the socket writes to the audit', () => {
  it('refuses an upgrade whose session carries no id, since nothing could read it again', async () => {
    const { written } = await driveUpgrade(gatewayWith({ sessionless: true }), `/api/cases/${CASE}/live`)

    expect(written.join('')).toContain('401')
  })

  it('records a refused upgrade, which the HTTP boundary never sees', async () => {
    const gateway = gatewayWith({ signedIn: false })

    const { written, destroyed } = await driveUpgrade(gateway, `/api/cases/${CASE}/live`)

    expect(destroyed, 'an unanswered upgrade holds a slot in the browser pool').toBe(true)
    expect(written.join('')).toContain('401')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ event: 'live_refused', outcome: 'failure' })
  })

  it('names the case in the line, so an audit can be read per case', async () => {
    const gateway = gatewayWith({ signedIn: false })

    await driveUpgrade(gateway, `/api/cases/${CASE}/live`)

    // In `detail`, not in `target`. The id came out of the caller's own URL and
    // the refusal is the reason nothing verified it, so it may name no case at
    // all -- and `target` is a partition column of the run window, which makes
    // a caller-chosen one a switch for whether their own run is counted.
    // -> `read.service.ts`, #541
    expect(recorded[0]?.detail?.['case']).toBe(CASE)
  })

  /**
   * **A run is only recognised while the caller cannot move the partition.**
   * `runLength` is counted per event, actor, target, address and time bucket,
   * and three of a `FAILURES` event in one window is what raises it to `High`.
   * A target taken from the URL hands the caller the fourth column, so varying
   * one character keeps every refusal a run of one and `Low` for ever.
   */
  it('names a refusal by its reason, never by anything the caller typed', async () => {
    const gateway = gatewayWith({ signedIn: false })

    await driveUpgrade(gateway, `/api/cases/${CASE}/live`)
    const first = recorded[0]?.target
    recorded.length = 0
    await driveUpgrade(gateway, `/api/cases/${OTHER}/live`)
    const second = recorded[0]?.target

    expect(first, 'a refusal recorded no target at all').toBeTruthy()
    expect(
      second,
      'two refusals of the same kind landed on two targets, so the caller decides the run',
    ).toBe(first)
    expect(String(first), 'the target carries the id the caller typed').not.toContain(CASE)
  })
})

describe('what it refuses', () => {
  /**
   * The hijack. A page on `evil.test` opens `ws://localhost:5174/...`; the
   * browser attaches the cookie and there is no preflight to stop it.
   */
  it('refuses a handshake from another origin', async () => {
    const verdict = await gatewayWith().check(
      request(`/api/cases/${CASE}/live`, {
        origin: 'http://evil.test',
        host: 'localhost:5174',
      }),
    )
    expect(verdict.refused).toBe('cross-origin')
  })

  /**
   * **A missing `Origin` is refused rather than trusted.** Every browser sends
   * one on a WebSocket handshake; a caller that does not is not the caller
   * this route has, and "absent" is the easiest header in the world to arrange.
   */
  it('refuses a handshake with no origin at all', async () => {
    const verdict = await gatewayWith().check(
      request(`/api/cases/${CASE}/live`, { host: 'localhost:5174' }),
    )
    expect(verdict.refused).toBe('cross-origin')
  })

  it('refuses a handshake with no session', async () => {
    const verdict = await gatewayWith({ signedIn: false }).check(
      request(`/api/cases/${CASE}/live`),
    )
    expect(verdict.refused).toBe('unauthenticated')
  })

  /**
   * The IDOR. Signed in is not the same as allowed on *this* case, and the
   * path is caller-controlled.
   */
  it('refuses a case the caller cannot reach', async () => {
    const verdict = await gatewayWith({ caseExists: false }).check(
      request(`/api/cases/${GHOST}/live`),
    )
    expect(verdict.refused).toBe('no-such-case')
  })

  it.each([
    ['a path that is not the live socket', '/api/cases/abc/other'],
    ['a case id that is not a uuid', '/api/cases/not-a-uuid/live'],
    ['the api root', '/api'],
  ])('refuses %s', async (_name, url) => {
    const verdict = await gatewayWith().check(request(url))
    expect(verdict.refused).toBe('no-such-path')
  })

  /**
   * **Origin is checked before the session**, so a cross-site handshake never
   * reaches the cookie at all. Ordering is not decoration here: the cheapest
   * check that refuses the most dangerous caller goes first.
   */
  it('refuses a cross-origin handshake even when the session is valid', async () => {
    const verdict = await gatewayWith({ signedIn: true }).check(
      request(`/api/cases/${CASE}/live`, { origin: 'https://evil.test', host: 'localhost:5174' }),
    )
    expect(verdict.refused).toBe('cross-origin')
  })

  /**
   * **The fourth check.** `MustChangePasswordInterceptor` returns
   * `next.handle()` for any non-HTTP context, so the socket needs its own
   * copy.
   *
   * Asserted on `check` alone: `driveUpgrade` carries one refusal out to a
   * client and this is not it, so the status this one writes is covered by
   * nothing.
   */
  it('refuses an account that has not set its own password yet', async () => {
    const verdict = await gatewayWith({ held: true }).check(request(`/api/cases/${CASE}/live`))
    expect(verdict.refused).toBe('must-change-password')
  })

  /**
   * The other half: the check reads one field and must not refuse a session
   * that simply does not carry it.
   */
  it('admits an account with no hold on it', async () => {
    const verdict = await gatewayWith({ held: false }).check(request(`/api/cases/${CASE}/live`))
    expect(verdict.refused).toBeNull()
  })
})

const REPORT = '33333333-3333-4333-8333-333333333333'
const FIELD = `reports:${REPORT}:document`
const SENT = new Date('2026-08-01T09:30:00.000Z')

/** The frames the browser puts on the wire, built with the server's own codec. */
const codec = new ProseService(null as never)

const wire = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

const decoderFor = (update: string) =>
  decoding.createDecoder(new Uint8Array(Buffer.from(update, 'base64')))

function typed(text: string): { update: string; doc: Y.Doc } {
  const doc = new Y.Doc()
  doc.getXmlFragment('block-1').insert(0, [new Y.XmlText(text)])
  return { update: wire(codec.frameUpdate(Y.encodeStateAsUpdate(doc))), doc }
}

function filed(text: string): Y.Doc {
  const doc = new Y.Doc()
  doc.getXmlFragment('block-1').insert(0, [new Y.XmlText(text)])
  return doc
}

/**
 * A socket that records what it was sent and lets a test push frames back.
 *
 * The `ws` handshake needs a server and a port; the message handling does not,
 * and the message handling is where this refusal lives.
 */
class FakeSocket {
  readonly sent: string[] = []
  terminated = false
  private readonly handlers = new Map<string, ((raw: Buffer) => void)[]>()

  send(payload: string): void {
    this.sent.push(payload)
  }

  terminate(): void {
    this.terminated = true
  }

  /** The code a close was sent with, or null while open. */
  closedWith: number | null = null

  close(code: number): void {
    this.closedWith = code
  }

  on(event: string, handler: (raw: Buffer) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    return this
  }

  frames(type: string): Record<string, unknown>[] {
    return this.sent
      .map((payload) => JSON.parse(payload) as Record<string, unknown>)
      .filter((frame) => frame['type'] === type)
  }

  receive(frame: unknown): void {
    for (const handler of this.handlers.get('message') ?? []) {
      handler(Buffer.from(JSON.stringify(frame)))
    }
  }

  /**
   * The browser went. Nothing is delivered to a handler attached afterwards.
   *
   * **Either event, because a broken connection raises both.** `drop()` alone
   * left `live.on('error', close)` asserted by nothing -- measured, deleting
   * that line kept every case green.
   */
  drop(how: 'close' | 'error' = 'close'): void {
    for (const handler of this.handlers.get(how) ?? []) handler(Buffer.alloc(0))
  }
}

/**
 * **A macrotask, not a count of microtasks.** `onProse` is started from a
 * synchronous `message` handler and awaits the resolve and the open, so a fixed
 * number of `await Promise.resolve()` turns is a guess that goes green while
 * asserting nothing.
 */
const settle = () => new Promise((done) => setTimeout(done, 0))

const holding = (level: 'read' | 'write' | 'delete') =>
  ({ levelOnCase: () => Promise.resolve({ customerId: 'a-default-customer', level }) }) as never

/**
 * One admitted connection, whose prose applies each frame to `document`, or
 * refuses it with `refusing` when that is set.
 *
 * The prose double stubs what reads the database; the codec is the real one,
 * so "the document did not move" is measured with the encoder production uses
 * rather than against a mock's call count. Which frames a sent report refuses
 * is `ProseService`'s, asserted in its own test.
 */
async function connected(
  refusing: Date | null,
  document: Y.Doc,
  level: 'read' | 'write' | 'delete' = 'write',
): Promise<{ live: FakeSocket; relayed: Record<string, unknown>[] }> {
  const relayed: Record<string, unknown>[] = []
  const channel = {
    join: () => Promise.resolve(),
    leave: () => Promise.resolve(),
    prose: (_caseId: string, payload: Record<string, unknown>) => {
      relayed.push(payload)
    },
  }
  const prose = {
    resolve: () => Promise.resolve({ table: 'reports', id: REPORT }),
    open: () => Promise.resolve(document),
    release: () => Promise.resolve(),
    watch: () => Promise.resolve(() => undefined),
    apply: (_caseId: string, _address: unknown, frame: Uint8Array, origin: unknown) =>
      Promise.resolve(refusing ? { refused: refusing } : { reply: codec.applySync(document, frame, origin) }),
    frameUpdate: codec.frameUpdate.bind(codec),
    isStateRequest: codec.isStateRequest.bind(codec),
    addsNothing: codec.addsNothing.bind(codec),
    hello: codec.hello.bind(codec),
  }
  const gateway = new LiveGateway(
    channel as unknown as CaseChannel,
    SIGNED_IN as never,
    prose as never,
    audit as never,
    holding(level),
  )

  const live = new FakeSocket()
  await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
  return { live, relayed }
}

describe('prose on a report that has been sent', () => {
  it('tells the client why, and when the report was filed', async () => {
    const { live } = await connected(SENT, filed('as filed'))

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('too late').update })
    await settle()

    expect(live.frames('prose.refused')).toEqual([
      { type: 'prose.refused', field: FIELD, reason: 'report-sent', sentAt: SENT.toISOString() },
    ])
  })

  /**
   * **A caret is not an edit.** Two analysts reading a filed report together
   * still see each other, and awareness is never stored - refusing it would
   * cost the reading and protect nothing.
   */
  it('still relays a caret', async () => {
    const { live, relayed } = await connected(SENT, filed('as filed'))
    const caret = wire(new Uint8Array([1, 2]))

    live.receive({ type: 'prose.awareness', field: FIELD, update: caret })
    await settle()

    expect(relayed).toEqual([{ type: 'prose.awareness', field: FIELD, update: caret }])
  })
})

describe('prose on a draft report', () => {
  it('applies an update', async () => {
    const document = new Y.Doc()
    const { live } = await connected(null, document)

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('still being written').update })
    await settle()

    expect(document.getXmlFragment('block-1').toJSON()).toContain('still being written')
    expect(live.frames('prose.refused')).toEqual([])
  })
})

describe('a read-only analyst watching a draft', () => {
  it('is refused a prose update, and the document is untouched', async () => {
    const document = new Y.Doc()
    const { live } = await connected(null, document, 'read')

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('not mine to write').update })
    await settle()

    expect(document.getXmlFragment('block-1').toJSON()).not.toContain('not mine to write')
    expect(live.frames('prose.refused')).toEqual([
      { type: 'prose.refused', field: FIELD, reason: 'read-only' },
    ])
  })

  /**
   * **A state request is not an edit**, and refusing it would leave a
   * read-only analyst watching a document that never caught up - which is the
   * failure a blanket refusal on the connection would produce while passing
   * the case above.
   */
  it('is still sent what it missed', async () => {
    const document = new Y.Doc()
    document.getXmlFragment('block-1')
    const { live } = await connected(null, document, 'read')
    live.sent.length = 0

    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(new Y.Doc())) })
    await settle()

    expect(live.frames('prose.refused')).toEqual([])
    expect(live.frames('prose.sync').length).toBeGreaterThan(0)
  })
})

describe('opening a field asks the client what it has', () => {
  const kinds = (live: FakeSocket) =>
    live.frames('prose.sync').map((frame) => decoderFor(frame['update'] as string).arr[0])

  it('answers the step 1, then sends its own, once', async () => {
    const { live } = await connected(null, filed('on the server'))

    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(new Y.Doc())) })
    await settle()
    live.receive({ type: 'prose.sync', field: FIELD, update: typed('a keystroke').update })
    await settle()

    expect(kinds(live)).toEqual([1, 0])
  })

  it('does not refuse a read-only analyst answering it with nothing new', async () => {
    const { live } = await connected(null, filed('as filed'), 'read')
    const mine = new Y.Doc()

    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(mine)) })
    await settle()
    for (const frame of live.frames('prose.sync')) {
      const reply = encoding.createEncoder()
      readSyncMessage(decoderFor(frame['update'] as string), reply, mine, 'the server')
      if (encoding.length(reply) > 0) {
        live.receive({ type: 'prose.sync', field: FIELD, update: wire(encoding.toUint8Array(reply)) })
      }
    }
    await settle()

    expect(mine.getXmlFragment('block-1').toJSON()).toContain('as filed')
    expect(live.frames('prose.refused')).toEqual([])
  })
})

describe('the connection dies with the authority that admitted it', () => {
  /** A gateway whose one session is `alive`, and whose one reach is `reaches`. */
  function gatewayFor(alive: () => boolean, reaches: () => boolean): LiveGateway {
    const channel = { join: () => Promise.resolve(), leave: () => Promise.resolve() }
    const auth = {
      api: {
        getSession: () =>
          Promise.resolve(alive() ? { user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } } : null),
      },
    }
    const reach = {
      levelOnCase: () =>
        Promise.resolve(reaches() ? { customerId: 'a-default-customer', level: 'write' as const } : null),
    }
    return new LiveGateway(channel as unknown as CaseChannel, auth as never, {} as never, audit as never, reach as never)
  }

  const admitted = { id: 'u-1', name: 'Ada', sessionId: 's-1' }

  const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))
  const A_ROW = '00000000-0000-4000-8000-00000000000a'

  /** A gateway whose session read and reach read are the given functions, and whose roster leaves are counted. */
  function gatewayAsking(session: () => Promise<unknown>, level: () => Promise<unknown>) {
    const left: string[] = []
    const channel = {
      join: () => Promise.resolve(),
      leave: () => {
        left.push('left')
        return Promise.resolve()
      },
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      { api: { getSession: session } } as never,
      {} as never,
      audit as never,
      { levelOnCase: level } as never,
    )
    return { gateway, left }
  }

  it('keeps the process up when the store cannot answer a re-read', async () => {
    const unhandled: unknown[] = []
    const count = (why: unknown) => { unhandled.push(why) }
    process.on('unhandledRejection', count)
    const { gateway } = gatewayAsking(
      () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }),
      () => Promise.reject(new Error('the store did not answer')),
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    reachChanged('u-1')
    await pause(20)
    process.off('unhandledRejection', count)

    expect({ unhandled: unhandled.length, closed: live.closedWith }).toEqual({ unhandled: 0, closed: null })
  })

  it('does not end a connection whose session could not be read', async () => {
    const { gateway } = gatewayAsking(
      () => Promise.reject(new Error('the session store did not answer')),
      () => Promise.resolve({ customerId: 'a-default-customer', level: 'write' }),
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    reachChanged('u-1')
    await pause(20)

    expect({ closed: live.closedWith, recorded: recorded.map((line) => line.event) }).toEqual({ closed: null, recorded: [] })
  })

  it('lets go of the roster as it closes, without waiting for the peer to answer', async () => {
    const { gateway, left } = gatewayAsking(
      () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }),
      () => Promise.resolve(null),
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    reachChanged('u-1')
    await pause(20)

    expect({ closed: live.closedWith, left }).toEqual({ closed: 4404, left: ['left'] })
  })

  it('records a refused claim once per connection, however often it is sent, naming the customer', async () => {
    const { gateway } = gatewayAsking(
      () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }),
      () => Promise.resolve({ customerId: 'a-default-customer', level: 'read' }),
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    live.receive({ type: 'claim', table: 'systems', id: A_ROW })
    live.receive({ type: 'claim', table: 'systems', id: A_ROW.replace(/a$/, 'b') })
    await pause(20)

    const lines = recorded.filter((line) => line.event === 'access_denied')
    expect(lines.map((line) => (line.detail as { customer?: string }).customer)).toEqual(['a-default-customer'])
  })

  it('keeps a claim taken at write after a re-read that saw read', async () => {
    let level = 'write'
    const released: string[] = []
    const channel = {
      join: () => Promise.resolve(),
      leave: () => Promise.resolve(),
      claim: () => Promise.resolve(),
      release: (_member: unknown, table: string, id: string) => {
        released.push(`${table}:${id}`)
        return Promise.resolve()
      },
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      { api: { getSession: () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }) } } as never,
      {} as never,
      audit as never,
      {
        levelOnCase: async () => {
          const now = level
          await pause(10)
          return { customerId: 'a-default-customer', level: now }
        },
      } as never,
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    level = 'read'
    reachChanged('u-1')
    await pause(2)
    level = 'write'
    live.receive({ type: 'claim', table: 'systems', id: A_ROW })
    await pause(80)

    expect(released).toEqual([])
  })

  it('gives up its claims when a frame finds it below write', async () => {
    let level = 'write'
    const released: string[] = []
    const channel = {
      join: () => Promise.resolve(),
      leave: () => Promise.resolve(),
      claim: () => Promise.resolve(),
      release: (_member: unknown, table: string, id: string) => {
        released.push(`${table}:${id}`)
        return Promise.resolve()
      },
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      { api: { getSession: () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }) } } as never,
      {} as never,
      audit as never,
      { levelOnCase: () => Promise.resolve({ customerId: 'a-default-customer', level }) } as never,
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)
    live.receive({ type: 'claim', table: 'systems', id: A_ROW })
    await pause(20)

    level = 'read'
    live.receive({ type: 'claim', table: 'systems', id: A_ROW.replace(/a$/, 'b') })
    await pause(20)

    expect(released).toEqual([`systems:${A_ROW}`])
  })

  it('gives up its claims once it holds less than write, and stays open to read', async () => {
    let level = 'write'
    const released: string[] = []
    const channel = {
      join: () => Promise.resolve(),
      leave: () => Promise.resolve(),
      claim: () => Promise.resolve(),
      release: (_member: unknown, table: string, id: string) => {
        released.push(`${table}:${id}`)
        return Promise.resolve()
      },
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      { api: { getSession: () => Promise.resolve({ user: { id: 'u-1', name: 'Ada' }, session: { id: 's-1' } }) } } as never,
      {} as never,
      audit as never,
      { levelOnCase: () => Promise.resolve({ customerId: 'a-default-customer', level }) } as never,
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)
    live.receive({ type: 'claim', table: 'systems', id: A_ROW })
    await pause(20)

    level = 'read'
    reachChanged('u-1')
    await pause(20)

    expect({ released, closed: live.closedWith }).toEqual({ released: [`systems:${A_ROW}`], closed: null })
  })

  it('records nothing of its own when the session ending was recorded where it happened', async () => {
    const gateway = gatewayFor(() => false, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    sessionEnded('u-1', 's-1', true)
    await settle()

    expect({ closed: live.closedWith, recorded: recorded.map((line) => line.event) }).toEqual({
      closed: 4401,
      recorded: [],
    })
  })

  it('records the ending itself when nothing else recorded it', async () => {
    const gateway = gatewayFor(() => false, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    sessionEnded('u-1', 's-1')
    await settle()

    expect({ closed: live.closedWith, recorded: recorded.map((line) => line.event) }).toEqual({
      closed: 4401,
      recorded: ['live_refused'],
    })
  })

  it('closes a socket when the session that opened it ends', async () => {
    let alive = true
    const gateway = gatewayFor(() => alive, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    alive = false
    sessionEnded('u-1', 's-1')
    await settle()

    expect(live.closedWith).toBe(4401)
  })

  it('closes a socket when the reach that admitted it is withdrawn', async () => {
    let reaches = true
    const gateway = gatewayFor(() => true, () => reaches)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    reaches = false
    reachChanged('u-1')
    await settle()

    expect(live.closedWith).toBe(4404)
  })

  it('leaves a socket open when the change left its authority whole', async () => {
    const gateway = gatewayFor(() => true, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, admitted)

    reachChanged('u-1')
    await settle()

    expect({ closed: live.closedWith, terminated: live.terminated }).toEqual({ closed: null, terminated: false })
  })

  it("leaves another analyst's socket open when reach changes", async () => {
    const gateway = gatewayFor(() => true, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-untouched', name: 'Dee', sessionId: 's-1' })

    reachChanged('u-revoked')

    expect(live.terminated).toBe(false)
  })

  it("leaves another analyst's socket open", async () => {
    const gateway = gatewayFor(() => true, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-safe', name: 'Bob', sessionId: 's-1' })

    sessionEnded('u-ended', 's-ended')

    expect(live.terminated).toBe(false)
  })

  it('terminates a socket open on a case that is dropped', async () => {
    const gateway = gatewayFor(() => true, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })

    gateway.dropCase(CASE)

    expect(live.terminated).toBe(true)
  })

  it('leaves a socket on another case open', async () => {
    const gateway = gatewayFor(() => true, () => true)
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })

    gateway.dropCase(GHOST)

    expect(live.terminated).toBe(false)
  })
})

/**
 * A socket that dies inside the join, which is what an abruptly killed browser
 * looks like from here.
 *
 * `PresenceStore.join` starts a heartbeat that refreshes the member key every
 * ten seconds and `leave` is the only thing that stops it, so a departure that
 * is never announced is a member key refreshed for the life of the process --
 * and `cases.service.ts` refuses to delete a case anyone is on.
 *
 * **Every analyst but one**, precisely: `othersOn(id, actorId)` excludes the
 * actor, so the account whose own browser died can still delete the case and
 * nobody else can -- and the refusal names a session that is long gone. -> #389
 */
describe('a socket that goes before the join has finished', () => {
  /**
   * The channel, with the join held open until the test lets it finish.
   *
   * **`order` records both calls, not just the leave.** Asserting that a leave
   * happened is satisfied by calling it immediately, which is the bug's twin:
   * `PresenceStore.leave` then clears an interval that does not exist and
   * deletes a key that has not been written, and `join` arms the heartbeat
   * afterwards. Measured -- with only a count asserted, that implementation
   * kept all 33 cases green.
   */
  function joining() {
    const left: string[] = []
    const order: string[] = []
    let finish: () => void = () => undefined
    const channel = {
      join: () =>
        new Promise<void>((resolve) => {
          finish = () => {
            order.push('join')
            resolve()
          }
        }),
      leave: (member: { sessionId: string }) => {
        order.push('leave')
        left.push(member.sessionId)
        return Promise.resolve()
      },
      prose: () => undefined,
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      SIGNED_IN as never,
      {} as never,
      audit as never,
      holding('write'),
    )
    return { gateway, left, order, finish: () => { finish() } }
  }

  it('leaves the roster, so the heartbeat is not refreshed for ever', async () => {
    const { gateway, left, order, finish } = joining()
    const live = new FakeSocket()

    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    live.drop()
    /**
     * **A turn between the drop and the join, or the ordering is free.**
     * Finishing on the next line lets *any* deferral -- a `queueMicrotask`, a
     * `setTimeout` -- push `join` first, so the assertion below held for an
     * implementation that never chained onto the join at all. Measured: that
     * one kept all 35 cases green until this wait was put in.
     */
    await settle()
    finish()
    await opening
    await settle()

    expect(left, 'nothing announced the departure, so the member key is refreshed for ever').toHaveLength(1)
    expect(order, 'the leave did not wait for the join it was meant to undo').toEqual(['join', 'leave'])
  })

  /**
   * **A join that rejects has already armed the heartbeat.**
   * `PresenceStore.join` sets the interval and `CaseChannel.join` announces
   * the roster afterwards, so a failure in that last step leaves the interval
   * running -- and a `.then` chain skips the leave exactly there. Same ghost,
   * one branch over.
   */
  it('leaves the roster even when the join itself fails', async () => {
    const left: string[] = []
    let refuse: (why: Error) => void = () => undefined
    const channel = {
      join: () =>
        new Promise<void>((_resolve, reject) => {
          refuse = reject
        }),
      leave: (member: { sessionId: string }) => {
        left.push(member.sessionId)
        return Promise.resolve()
      },
      prose: () => undefined,
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      SIGNED_IN as never,
      {} as never,
      audit as never,
      holding('write'),
    )
    const live = new FakeSocket()

    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    live.drop()
    refuse(new Error('redis went away announcing the roster'))
    await opening.catch(() => undefined)
    await settle()

    expect(left, 'the join failed with the heartbeat already running, and nothing stopped it').toHaveLength(1)
  })

  /**
   * Both `close` and `error` fire on a broken connection -- `ws` emits `error`
   * and then `close` on one broken pipe -- so without the guard the leave runs
   * twice. It takes nobody else's claim: `PresenceStore.leave` filters by
   * `sessionId`, which is `pid-counter` and never reused. What a second one
   * costs is a redundant `announcePresence` and the round trip under it.
   */
  it('leaves once, however many ways the socket says it has gone', async () => {
    const { gateway, left, finish } = joining()
    const live = new FakeSocket()

    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    // Both events, because a broken connection raises both and each is wired.
    live.drop('close')
    live.drop('error')
    finish()
    await opening
    await settle()

    expect(left).toHaveLength(1)
  })

  /** `error` alone, so the handler on it is asserted by something. */
  it('leaves the roster when the socket only errors', async () => {
    const { gateway, left, finish } = joining()
    const live = new FakeSocket()

    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    live.drop('error')
    finish()
    await opening
    await settle()

    expect(left, 'nothing is listening for a socket that errors rather than closing').toHaveLength(1)
  })
})

describe('what a claim frame may name', () => {
  const ROW = '44444444-4444-4444-8444-444444444444'

  async function claiming() {
    const claimed: string[] = []
    const channel = {
      join: () => Promise.resolve(),
      leave: () => Promise.resolve(),
      prose: () => undefined,
      claim: (_member: unknown, table: string, id: string) => {
        claimed.push(`${table}:${id}`)
        return Promise.resolve()
      },
      release: (_member: unknown, table: string, id: string) => {
        claimed.splice(claimed.indexOf(`${table}:${id}`), 1)
        return Promise.resolve()
      },
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      SIGNED_IN as never,
      {} as never,
      audit as never,
      holding('write'),
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    return { live, claimed }
  }

  it('refuses a table name no collection could have', async () => {
    const { live, claimed } = await claiming()

    live.receive({ type: 'claim', table: 'x'.repeat(65_000), id: ROW })
    live.receive({ type: 'claim', table: 'Systems; drop', id: ROW })
    await settle()

    expect(claimed, 'an arbitrary string became a field of the case claims hash').toEqual([])
  })

  it('refuses an entry id that is not a uuid', async () => {
    const { live, claimed } = await claiming()

    live.receive({ type: 'claim', table: 'systems', id: 'x'.repeat(65_000) })
    await settle()

    expect(claimed).toEqual([])
  })

  it('takes a claim that names a plausible table and a real id', async () => {
    const { live, claimed } = await claiming()

    live.receive({ type: 'claim', table: 'network_indicators', id: ROW })
    await settle()

    expect(claimed).toEqual([`network_indicators:${ROW}`])
  })

  it('stops claiming once the connection holds more than a screen ever could', async () => {
    const { live, claimed } = await claiming()

    for (let n = 0; n < 200; n += 1) {
      live.receive({
        type: 'claim',
        table: 'systems',
        id: `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`,
      })
    }
    await settle()

    expect(claimed.length).toBeLessThanOrEqual(64)
    expect(claimed.length, 'the cap is below what one screen legitimately holds').toBeGreaterThan(1)
  })

  /** A released row gives its place back, or a long session runs out of cap. */
  it('counts a released claim as given back', async () => {
    const { live, claimed } = await claiming()

    for (let n = 0; n < 200; n += 1) {
      live.receive({
        type: 'claim',
        table: 'systems',
        id: `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`,
      })
    }
    await settle()
    const full = claimed.length
    live.receive({ type: 'release', table: 'systems', id: '44444444-4444-4444-8444-000000000000' })
    await settle()
    live.receive({ type: 'claim', table: 'systems', id: ROW })
    await settle()

    expect(claimed).toContain(`systems:${ROW}`)
    expect(claimed).toHaveLength(full)
  })
})

/** Over a real socket, because `ws` enforces `maxPayload` below anything a double can see. */
describe('how much of a frame the socket will read', () => {
  it('closes a socket that sends a frame past the bound', async () => {
    const channel = {
      join: () => Promise.resolve(),
      leave: () => Promise.resolve(),
      prose: () => undefined,
    }
    // Filled once the port is known: the client's origin is the install's own.
    const trustedOrigins: string[] = []
    const auth = {
      instance: { options: { trustedOrigins } },
      api: {
        getSession: () =>
          Promise.resolve({ user: { id: 'u-1', name: 'Ada', email: 'a@b.test' }, session: { id: 's-1' } }),
      },
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      auth as never,
      {} as never,
      audit as never,
      holding('write'),
    )
    const server = createServer()
    gateway.attach(server)
    await new Promise<void>((listening) => {
      server.listen(0, '127.0.0.1', listening)
    })
    const { port } = server.address() as AddressInfo
    trustedOrigins.push(`http://127.0.0.1:${String(port)}`)

    const client = new Client(`ws://127.0.0.1:${String(port)}/api/cases/${CASE}/live`, {
      origin: `http://127.0.0.1:${String(port)}`,
    })
    await new Promise<void>((open, fail) => {
      client.on('open', () => { open() })
      client.on('error', fail)
    })
    const closed = new Promise<number>((code) => {
      client.on('close', (why: number) => { code(why) })
    })
    // A close code arrives as an error on the client too; unhandled, it is a stray rejection.
    client.on('error', () => undefined)

    client.send(JSON.stringify({ type: 'claim', table: 'x'.repeat(200_000), id: CASE }))

    expect(await closed, 'the socket read a frame it should have refused').toBe(1009)

    gateway.beforeApplicationShutdown()
    await new Promise<void>((done) => {
      server.close(() => { done() })
    })
  })
})

/** The reader count is observed through the double, because `ProseService` exposes none. */
describe('two prose frames for one field arriving together', () => {
  it('takes one reader, so closing the socket gives the last one back', async () => {
    let readers = 0
    const document = new Y.Doc()
    const channel = {
      join: () => Promise.resolve(),
      leave: () => Promise.resolve(),
      prose: () => undefined,
    }
    const prose = {
      resolve: () => Promise.resolve({ table: 'reports', id: REPORT }),
      open: () => {
        readers += 1
        return Promise.resolve(document)
      },
      release: () => {
        readers -= 1
        return Promise.resolve()
      },
      apply: (_caseId: string, _address: unknown, frame: Uint8Array, origin: unknown) =>
        Promise.resolve({ reply: codec.applySync(document, frame, origin) }),
      frameUpdate: codec.frameUpdate.bind(codec),
      isStateRequest: codec.isStateRequest.bind(codec),
      addsNothing: codec.addsNothing.bind(codec),
      hello: codec.hello.bind(codec),
      watch: () => Promise.resolve(() => undefined),
    }
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      SIGNED_IN as never,
      prose as never,
      audit as never,
      holding('write'),
    )
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('one').update })
    live.receive({ type: 'prose.sync', field: FIELD, update: typed('two').update })
    await settle()
    expect(readers, 'one field was opened twice for one connection').toBe(1)

    live.drop()
    await settle()

    expect(readers, 'a reader was never given back, so the document is never destroyed').toBe(0)
  })
})

/**
 * **The browser speaks first, and the gateway has not finished joining.**
 * `handleUpgrade` writes the 101 before `open` runs, so the socket is live in
 * the browser while the roster join is still in flight over Redis. The harness
 * tier drives this over a real socket in
 * `test/a-connection-acts-on-every-frame-in-order.test.ts`; these are the fast
 * guards on the same door.
 */
describe('frames that arrive while the socket is still joining', () => {
  /**
   * The channel with the join held open until the test finishes it. A `slow`
   * level lookup lets a frame behind it overtake it; an `immediate` one lets a
   * frame acted on too early land before the join does.
   */
  function midJoin(document: Y.Doc, lookup: 'slow' | 'immediate' = 'slow') {
    const order: string[] = []
    const left: string[] = []
    let finish: () => void = () => undefined
    const channel = {
      join: () =>
        new Promise<void>((resolve) => {
          finish = () => {
            order.push('join')
            resolve()
          }
        }),
      leave: () => {
        order.push('leave')
        left.push('leave')
        return Promise.resolve()
      },
      prose: () => undefined,
      claim: (_member: unknown, table: string, id: string) => {
        order.push(`claim ${table}/${id}`)
        return Promise.resolve()
      },
      release: (_member: unknown, table: string, id: string) => {
        order.push(`release ${table}/${id}`)
        return Promise.resolve()
      },
    }
    /** What the document held each time a reader was given back, and how many are still out. */
    const releasedHolding: string[] = []
    let readers = 0
    const prose = {
      resolve: () => Promise.resolve({ table: 'reports', id: REPORT }),
      open: () => {
        readers += 1
        return Promise.resolve(document)
      },
      release: () => {
        readers -= 1
        releasedHolding.push(document.getXmlFragment('block-1').toJSON())
        order.push('reader released')
        return Promise.resolve()
      },
      apply: (_caseId: string, _address: unknown, frame: Uint8Array, origin: unknown) =>
        Promise.resolve({ reply: codec.applySync(document, frame, origin) }),
      frameUpdate: codec.frameUpdate.bind(codec),
      isStateRequest: codec.isStateRequest.bind(codec),
      addsNothing: codec.addsNothing.bind(codec),
      hello: codec.hello.bind(codec),
      watch: () => Promise.resolve(() => undefined),
    }
    const reached = { customerId: 'a-default-customer', level: 'write' as const }
    const levels = {
      levelOnCase: () =>
        lookup === 'immediate'
          ? Promise.resolve(reached)
          : new Promise((resolve) => setTimeout(() => { resolve(reached) }, 20)),
    } as never
    const gateway = new LiveGateway(
      channel as unknown as CaseChannel,
      SIGNED_IN as never,
      prose as never,
      audit as never,
      levels,
    )
    return { gateway, channel, order, left, releasedHolding, readers: () => readers, finish: () => { finish() } }
  }

  const ROW = '44444444-4444-4444-8444-444444444444'
  const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

  it('answers a state request that beat the roster, so the editor is built', async () => {
    const document = new Y.Doc()
    document.getXmlFragment('block-1').insert(0, [new Y.XmlText('what was already written')])
    const { gateway, finish } = midJoin(document)
    const live = new FakeSocket()

    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(new Y.Doc())) })
    await settle()
    finish()
    await opening
    await wait(50)

    expect(
      live.frames('prose.sync'),
      'the state request was dropped, so the editor never leaves its loading state',
    ).not.toEqual([])
  })

  /**
   * **After the join, not merely eventually.** `CaseChannel.claim` announces the
   * roster, and until the join returns this member is in neither the local room
   * nor the subscription.
   */
  it('takes a claim that beat the roster, and not before the roster has it', async () => {
    const { gateway, order, finish } = midJoin(new Y.Doc(), 'immediate')
    const live = new FakeSocket()

    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    live.receive({ type: 'claim', table: 'casenotes', id: ROW })
    await settle()
    finish()
    await opening
    await wait(50)

    expect(order, 'the claim was dropped, or taken before the roster held its author').toEqual([
      'join',
      `claim casenotes/${ROW}`,
    ])
  })

  it('acts on a release after the claim sent before it, however long the claim takes', async () => {
    const { gateway, order, finish } = midJoin(new Y.Doc())
    const live = new FakeSocket()
    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    finish()
    await opening

    live.receive({ type: 'claim', table: 'systems', id: ROW })
    live.receive({ type: 'release', table: 'systems', id: ROW })
    await wait(200)

    expect(order, 'the release overtook its own claim').toEqual([
      'join',
      `claim systems/${ROW}`,
      `release systems/${ROW}`,
    ])
  })

  /** A tab that sends and closes at once: its words land before its reader goes. */
  it('acts on what arrived before the socket went, then gives its reader back and leaves', async () => {
    const document = new Y.Doc()
    const { gateway, order, releasedHolding, readers, finish } = midJoin(document)
    const live = new FakeSocket()
    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })

    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(new Y.Doc())) })
    live.receive({ type: 'prose.sync', field: FIELD, update: typed('sent as the tab closed').update })
    live.drop()
    finish()
    await opening
    await wait(100)

    expect(releasedHolding, 'the reader went before the words that needed it').toEqual([
      expect.stringContaining('sent as the tab closed'),
    ])
    expect(readers(), 'a frame behind the end opened a reader nothing gives back').toBe(0)
    expect(order.at(-1), 'the connection left before it had finished').toBe('leave')
  })

  it('carries on past a frame whose action fails, and still leaves', async () => {
    const { gateway, channel, order, finish } = midJoin(new Y.Doc(), 'immediate')
    channel.claim = () => Promise.reject(new Error('the store went away'))
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const live = new FakeSocket()
    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    finish()
    await opening

    live.receive({ type: 'claim', table: 'systems', id: ROW })
    live.receive({ type: 'release', table: 'systems', id: ROW })
    live.drop()
    await wait(50)
    warned.mockRestore()

    expect(order, 'a failed frame stopped what came behind it').toEqual(['join', `release systems/${ROW}`, 'leave'])
  })

  /** Silent, as for a frame that is not JSON: a warning per frame is a log any admitted client can fill. */
  it('ignores a frame that is JSON and not an object, as it ignores one that is not JSON', async () => {
    const { gateway, order, finish } = midJoin(new Y.Doc(), 'immediate')
    const warned = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const live = new FakeSocket()
    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })
    finish()
    await opening

    for (const odd of [null, 7, 'claim', [], true]) live.receive(odd)
    live.receive({ type: 'release', table: 'systems', id: ROW })
    live.drop()
    await wait(50)
    // Read before the restore, which empties the record of calls.
    const logged = warned.mock.calls.map((call) => String(call[0]))
    warned.mockRestore()

    expect(order, 'a frame behind the odd one, or the end, was dropped').toEqual([
      'join',
      `release systems/${ROW}`,
      'leave',
    ])
    expect(logged, 'a frame the client got wrong was logged as a failure to apply it').toEqual([])
  })

  it('ends a connection with more frames waiting than the bound, and acts on those within it', async () => {
    const { gateway, order, finish } = midJoin(new Y.Doc(), 'immediate')
    const live = new FakeSocket()
    const opening = gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada', sessionId: 's-1' })

    for (let n = 0; n < 256; n += 1) live.receive({ type: 'release', table: 'systems', id: ROW })
    expect(live.terminated, 'ended while the backlog was within the bound').toBe(false)
    live.receive({ type: 'release', table: 'systems', id: ROW })
    expect(live.terminated, 'a backlog past the bound was held').toBe(true)

    finish()
    await opening
    await wait(50)
    expect(order.filter((step) => step.startsWith('release')), 'a frame within the bound was dropped').toHaveLength(256)
  })
})
