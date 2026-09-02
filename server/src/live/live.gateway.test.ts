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
import type { IncomingMessage } from 'node:http'

import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { beforeEach, describe, expect, it } from 'vitest'
import type { WebSocket } from 'ws'
import { readSyncMessage, writeSyncStep2 } from 'y-protocols/sync'
import * as Y from 'yjs'

import { LiveGateway } from './live.gateway.js'
import { ProseService } from '../prose/prose.service.js'
import type { CaseChannel } from './case-channel.service.js'
import { sessionEnded } from '../auth/session-ended.js'

const CASE = '11111111-1111-4111-8111-111111111111'
const GHOST = '22222222-2222-4222-8222-222222222222'

/**
 * What the socket wrote to the audit, per test.
 *
 * **A recorder rather than a stub.** `record` is called on both branches of
 * the upgrade -- once for a refusal and once for an opening -- and an empty
 * object throws on the first of them, so a test that reached either path used
 * to be impossible to write. Cleared by `beforeEach`.
 */
const recorded: { event: string; outcome?: string; target?: unknown }[] = []
const audit = {
  record: (line: { event: string; outcome?: string; target?: unknown }) => {
    recorded.push(line)
    return Promise.resolve()
  },
}

beforeEach(() => {
  recorded.length = 0
})


/** A gateway whose session and case lookups answer however the test needs. */
function gatewayWith(
  options: { signedIn?: boolean; caseExists?: boolean; held?: boolean } = {},
) {
  const { signedIn = true, caseExists = true, held = false } = options

  const auth = {
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
              }
            : null,
        ),
    },
  }
  const db = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(caseExists ? [{ id: CASE }] : []) }),
    }),
  }
  return new LiveGateway(
    {} as CaseChannel,
    auth as never,
    db as never,
    // The gateway's prose half is not what these cases drive; a stand-in keeps
    // the constructor honest rather than the argument list short.
    {} as never,
    // **Recording, not empty.** The socket audits itself because nothing else
    // can -- no guard, pipe, middleware or interceptor runs on an upgrade --
    // and an empty object would make `this.activity.record` throw the moment a
    // case drove the upgrade path rather than the verdict.
    audit as never,
    anyoneReaches,
  )
}

const request = (
  url: string,
  headers: Record<string, string> = { origin: 'http://localhost:5174', host: 'localhost:5174' },
) => ({ url, headers }) as unknown as IncomingMessage

/**
 * A reach stand-in that admits whatever the stub database says exists.
 *
 * **These cases are not about reach**, and none of them builds a customer or a
 * group -- so the question `reachesCase` asks is answered `yes` here and the
 * refusals below stay the ones each case is actually driving. What reach
 * refuses is asserted in `the-socket-asks-reach-too.test.ts`, against real
 * rows.
 */
const anyoneReaches = {
  defaultCustomerId: () => Promise.resolve('a-default-customer'),
  levelFor: () => Promise.resolve('write' as const),
} as never

describe('what the handshake lets through', () => {
  it('admits a signed-in analyst, same origin, on a case that exists', async () => {
    const verdict = await gatewayWith().check(request(`/api/cases/${CASE}/live`))
    expect(verdict).toMatchObject({ refused: null, caseId: CASE })
  })
})

describe('behind the proxy', () => {
  /**
   * **The headers a browser and nginx actually produce together**, which is
   * the shape no other tier sees: `server/e2e/` drives the plaintext dev
   * server with no proxy in front of it.
   *
   * `sameOrigin` compares the forwarded `Host` against the browser's `Origin`,
   * and `Origin` always carries a non-default port. So the edge has to forward
   * `$http_host` and not `$host` -- the latter strips it, and every upgrade on
   * a stack published anywhere but 443 was refused `403 cross-origin` while
   * every HTTP route answered perfectly. Presence, claims, the change fan-out
   * and the report CRDT are all on this handshake.
   */
  it('admits an upgrade whose forwarded Host carries the published port', async () => {
    const verdict = await gatewayWith().check(
      request(`/api/cases/${CASE}/live`, {
        origin: 'https://localhost:8443',
        host: 'localhost:8443',
      }),
    )
    expect(verdict).toMatchObject({ refused: null })
  })

  it('refuses one whose Host lost the port on the way through', async () => {
    const verdict = await gatewayWith().check(
      request(`/api/cases/${CASE}/live`, {
        origin: 'https://localhost:8443',
        host: 'localhost',
      }),
    )
    expect(
      verdict.refused,
      'a proxy forwarding `$host` strips the port, and this is what the ' +
        'analyst then sees: sockets dead, every page load fine',
    ).toBe('cross-origin')
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
  // The handler is sync and the work inside it is not; one turn is enough for
  // `check` to settle, because every lookup under it is already resolved.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  return { written, destroyed }
}

describe('what the socket writes to the audit', () => {
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

    expect(recorded[0]?.target).toContain(CASE)
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
   * Asserted on `check` alone: nothing in this file drives a real upgrade,
   * so the refusal reaching a client is covered by nothing.
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

/** One update from a client, framed and base64 as the socket carries it. */
function typed(text: string): { update: string; doc: Y.Doc } {
  const doc = new Y.Doc({ gc: false })
  doc.getXmlFragment('block-1').insert(0, [new Y.XmlText(text)])
  return { update: wire(codec.frameUpdate(Y.encodeStateAsUpdate(doc))), doc }
}

/** A client answering a hello with everything it has - a write, not a read. */
function answered(doc: Y.Doc): string {
  const encoder = encoding.createEncoder()
  writeSyncStep2(encoder, doc)
  return wire(encoding.toUint8Array(encoder))
}

/** A report as it was filed. */
function filed(text: string): Y.Doc {
  const doc = new Y.Doc({ gc: false })
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

  on(event: string, handler: (raw: Buffer) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    return this
  }

  /** What the client would have received, of one type. */
  frames(type: string): Record<string, unknown>[] {
    return this.sent
      .map((payload) => JSON.parse(payload) as Record<string, unknown>)
      .filter((frame) => frame['type'] === type)
  }

  receive(frame: Record<string, unknown>): void {
    for (const handler of this.handlers.get('message') ?? []) {
      handler(Buffer.from(JSON.stringify(frame)))
    }
  }
}

/**
 * **A macrotask, not a count of microtasks.** `onProse` is started from a
 * synchronous `message` handler and awaits the resolve and the open, so a fixed
 * number of `await Promise.resolve()` turns is a guess that goes green while
 * asserting nothing.
 */
const settle = () => new Promise((done) => setTimeout(done, 0))

/**
 * A database that answers the one question `levelOnCase` asks of it: which
 * customer this case belongs to. `null` sends it to the default, which the
 * reach stand-in below then answers for.
 */
const caseWithNoCustomer = {
  select: () => ({ from: () => ({ where: () => Promise.resolve([{ customerId: null }]) }) }),
} as never

/** A reach stand-in that holds one level over everything. */
const holding = (level: 'read' | 'write' | 'delete') =>
  ({
    defaultCustomerId: () => Promise.resolve('a-default-customer'),
    levelFor: () => Promise.resolve(level),
  }) as never

/**
 * One admitted connection, with the report in whatever state the case needs.
 *
 * The prose double stubs only the two methods that read the database; the codec
 * is the real one, so "the document did not move" is measured with the encoder
 * production uses rather than against a mock's call count.
 */
async function connected(
  sentAt: Date | null,
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
    resolve: () => Promise.resolve({ reportId: REPORT, sentAt }),
    open: () => Promise.resolve(document),
    release: () => Promise.resolve(),
    applySync: codec.applySync.bind(codec),
    frameUpdate: codec.frameUpdate.bind(codec),
    isStateRequest: codec.isStateRequest.bind(codec),
  }
  const gateway = new LiveGateway(
    channel as unknown as CaseChannel,
    {} as never,
    caseWithNoCustomer,
    prose as never,
    audit as never,
    holding(level),
  )

  const live = new FakeSocket()
  await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada' })
  return { live, relayed }
}

/**
 * As `connected`, with the stamp read afresh on every `resolve` and the member
 * handed back - so a test can file the report mid-session and deliver the
 * `case.changed` the gateway would have received.
 */
async function watched(
  sentAt: () => Date | null,
  document: Y.Doc,
): Promise<{ live: FakeSocket; member: { send: (payload: string) => void } }> {
  let member: { send: (payload: string) => void } | null = null
  const channel = {
    join: (joined: { send: (payload: string) => void }) => {
      member = joined
      return Promise.resolve()
    },
    leave: () => Promise.resolve(),
    prose: () => undefined,
  }
  const prose = {
    resolve: () => Promise.resolve({ reportId: REPORT, sentAt: sentAt() }),
    open: () => Promise.resolve(document),
    release: () => Promise.resolve(),
    applySync: codec.applySync.bind(codec),
    frameUpdate: codec.frameUpdate.bind(codec),
    isStateRequest: codec.isStateRequest.bind(codec),
  }
  const gateway = new LiveGateway(
    channel as unknown as CaseChannel,
    {} as never,
    caseWithNoCustomer,
    prose as never,
    audit as never,
    holding('write'),
  )
  const live = new FakeSocket()
  await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada' })
  if (!member) throw new Error('the gateway did not join the channel')
  return { live, member }
}

describe('prose on a report that has been sent', () => {
  /**
   * **Readable, or the refusal is worse than the hole.** Refusing the field in
   * `resolve` or `open` would leave an analyst unable to read what their own
   * organisation filed; the gate is per frame for exactly this case.
   */
  it('answers a state request, so the filed text still loads', async () => {
    const { live } = await connected(SENT, filed('the initial finding was a false positive'))

    const mine = new Y.Doc({ gc: false })
    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(mine)) })
    await settle()

    const [reply] = live.frames('prose.sync')
    expect(reply, 'a filed report must still load').toBeDefined()
    readSyncMessage(
      decoderFor(reply!['update'] as string),
      encoding.createEncoder(),
      mine,
      'the server',
    )
    expect(mine.getXmlFragment('block-1').toJSON()).toContain('false positive')
  })

  it.each([
    ['an update', () => typed('quietly rewritten after filing').update],
    ['a step 2', () => answered(typed('rewritten by answering a hello').doc)],
  ])('refuses %s and leaves the document byte-identical', async (_name, build) => {
    const document = filed('the initial finding was a false positive')
    const before = Buffer.from(Y.encodeStateAsUpdate(document))
    const { live } = await connected(SENT, document)

    live.receive({ type: 'prose.sync', field: FIELD, update: build() })
    await settle()

    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before)).toBe(true)
    expect(document.getXmlFragment('block-1').toJSON()).not.toContain('rewritten')
  })

  /**
   * **Told, not dropped.** The analyst has already seen their own keystrokes; a
   * refusal that says nothing leaves them believing text landed that reached
   * nobody and nothing.
   */
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

describe('a report filed while somebody is typing into it', () => {
  /**
   * **The window this closes, and why it was not theoretical.** `sentAt` is
   * read once, when the connection opens the field. An analyst who had the
   * section open when somebody else pressed Send therefore kept writing into a
   * document the server was still accepting - the freeze that Send performs was
   * not the freeze the socket enforced, and the two disagreed for as long as
   * that connection held the field.
   *
   * **Closed off the fan-out the connection already receives**, not by a query
   * per keystroke: `case.changed` names the scopes that moved, so a `reports`
   * change drops the cached stamp and the next frame re-reads it. That is one
   * extra read per filing rather than one per keystroke.
   */
  it('refuses the next update after the case says reports moved', async () => {
    const document = new Y.Doc({ gc: false })
    let sentAt: Date | null = null
    const { live, member } = await watched(() => sentAt, document)

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('still a draft').update })
    await settle()
    expect(document.getXmlFragment('block-1').toJSON()).toContain('still a draft')

    // Somebody else files it, and the fan-out reaches this connection.
    sentAt = SENT
    member.send(JSON.stringify({ type: 'case.changed', scopes: ['reports'], by: 'Bob' }))
    await settle()

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('written after the send').update })
    await settle()

    expect(document.getXmlFragment('block-1').toJSON()).not.toContain('written after the send')
    expect(live.frames('prose.refused')).toEqual([
      { type: 'prose.refused', field: FIELD, reason: 'report-sent', sentAt: SENT.toISOString() },
    ])
  })

  /**
   * **A change to something else must not cost a read.** Every write in the
   * case fans out, so re-reading on any of them would be the per-keystroke
   * query this avoids - a timeline entry saved while somebody writes is the
   * ordinary case, not the exception.
   */
  it('does not re-read when the change was in another scope', async () => {
    const document = new Y.Doc({ gc: false })
    let reads = 0
    const { live, member } = await watched(() => { reads += 1; return null }, document)

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('one').update })
    await settle()
    const afterOpen = reads

    member.send(JSON.stringify({ type: 'case.changed', scopes: ['timeline'], by: 'Bob' }))
    await settle()
    live.receive({ type: 'prose.sync', field: FIELD, update: typed('two').update })
    await settle()

    expect(reads).toBe(afterOpen)
  })
})

describe('prose on a draft report', () => {
  /**
   * **The other half of the gate.** A refusal keyed on nothing - refusing every
   * update - passes every case above while making the product unusable, and
   * only this one goes red.
   */
  it('applies the same update a sent report refuses', async () => {
    const document = new Y.Doc({ gc: false })
    const { live } = await connected(null, document)

    live.receive({ type: 'prose.sync', field: FIELD, update: typed('still being written').update })
    await settle()

    expect(document.getXmlFragment('block-1').toJSON()).toContain('still being written')
    expect(live.frames('prose.refused')).toEqual([])
  })
})

describe('a read-only analyst watching a draft', () => {
  /**
   * **Admission is read; editing is a write.** The socket admits at the
   * weakest level so somebody entitled to watch a case can, and without asking
   * again before applying an update that same connection could edit the
   * document -- making the socket the weaker of the two doors the moment the
   * HTTP guard started asking for a level.
   */
  it('is refused a prose update, and the document is untouched', async () => {
    const document = new Y.Doc({ gc: false })
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
    const document = new Y.Doc({ gc: false })
    document.getXmlFragment('block-1')
    const { live } = await connected(null, document, 'read')
    live.sent.length = 0

    live.receive({ type: 'prose.sync', field: FIELD, update: wire(codec.hello(new Y.Doc())) })
    await settle()

    expect(live.frames('prose.refused')).toEqual([])
    expect(live.frames('prose.sync').length).toBeGreaterThan(0)
  })
})

describe('the connection dies with the reach that admitted it', () => {
  function gatewayForDrop(): LiveGateway {
    const channel = { join: () => Promise.resolve(), leave: () => Promise.resolve() }
    return new LiveGateway(
      channel as unknown as CaseChannel,
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      anyoneReaches,
    )
  }

  it('terminates a socket when the session that opened it ends', async () => {
    const gateway = gatewayForDrop()
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-ended', name: 'Ada' })

    sessionEnded('u-ended')

    expect(live.terminated).toBe(true)
  })

  it("leaves another analyst's socket open", async () => {
    const gateway = gatewayForDrop()
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-safe', name: 'Bob' })

    sessionEnded('u-ended')

    expect(live.terminated).toBe(false)
  })

  it('terminates a socket open on a case that is dropped', async () => {
    const gateway = gatewayForDrop()
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada' })

    gateway.dropCase(CASE)

    expect(live.terminated).toBe(true)
  })

  it('leaves a socket on another case open', async () => {
    const gateway = gatewayForDrop()
    const live = new FakeSocket()
    await gateway.open(live as unknown as WebSocket, CASE, { id: 'u-1', name: 'Ada' })

    gateway.dropCase(GHOST)

    expect(live.terminated).toBe(false)
  })
})
