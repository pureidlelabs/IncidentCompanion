/**
 * `ws://.../api/cases/:id/live` - the socket the shell opens per case.
 *
 * **A raw `ws` server on `upgrade`, not a Nest gateway and not Socket.IO.**
 * The client opens a *parameterised path*, which `@WebSocketGateway` cannot
 * bind and whose framing Socket.IO would change.
 *
 * ## The handshake is the whole security boundary
 *
 * **No guard, pipe or middleware runs on an upgrade**, so all four checks
 * below are done by hand, and a missing one looks like nothing at all.
 *
 * - **Origin, against the install's own.** WebSocket handshakes are *not*
 *   subject to CORS, so without this any website an analyst visits can open a
 *   socket carrying
 *   their cookie and read the case - cross-site WebSocket hijacking. There is
 *   no preflight to stop it and the browser sends the cookie regardless.
 * - **A session**, from the same cookie every request carries. Otherwise the
 *   roster shows names nobody proved.
 * - **Access to *that case*.** Authenticating and then trusting the id in the
 *   path is the classic IDOR: any signed-in analyst could open a socket on any
 *   case uuid and receive its presence and every change announcement. This
 *   asks `ReachService.levelOnCase`, the question `CaseAccessGuard` asks.
 *
 * - **A password the account chose itself.** `MustChangePasswordInterceptor`
 *   returns `next.handle()` for any non-HTTP context, so a held account is
 *   refused every route and reaches this one. It can otherwise read the
 *   change feed and claim rows, refusing other analysts' writes.
 *
 * `live.gateway.test.ts` asserts all four, because a missing one is invisible.
 */
import { Injectable, Logger, type BeforeApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { AuthService } from '@thallesp/nestjs-better-auth'
import type { IncomingHttpHeaders, IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type * as Y from 'yjs'

import { actingAs } from '../db/scope.js'
import { CaseChannel, type Member } from './case-channel.service.js'
import { Carets } from './carets.js'
import { ProseService, type ProseRecord, type Writer } from '../prose/prose.service.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { onSessionEnded } from '../auth/session-ended.js'
import { ReachService } from '../access/reach.service.js'
import { UUID } from '../access/case-access.guard.js'
import { onReachChanged } from '../access/reach-changed.js'
import { attribute, callerAddress, NO_ADDRESS } from '../wire/caller-address.js'
import { Allowances } from './allowance.js'

const LIVE_PATH = /^\/api\/cases\/([^/]+)\/live$/i

/** Why an upgrade was refused. Returned rather than logged, so a test can read it. */
export type Refusal =
  | 'no-such-path'
  | 'cross-origin'
  | 'unauthenticated'
  | 'must-change-password'
  | 'no-such-case'
  | 'too-many'

/**
 * The status line each refusal answers with.
 *
 * **Exported so the set of refusals can be enumerated at run time**, which is
 * what `the-socket-refuses-observably.test.ts` needs to hold every one of them
 * to being reachable -- *a check nobody can observe failing is a check nobody
 * knows is gone*. The `Refusal` union is a type and vanishes at run time; these
 * keys are the same list and survive.
 */
export const STATUS: Record<Refusal, string> = {
  'no-such-path': '404 Not Found',
  'cross-origin': '403 Forbidden',
  unauthenticated: '401 Unauthorized',
  // Matches what the interceptor answers on HTTP, so a client meets one
  // status for this state rather than two.
  'must-change-password': '403 Forbidden',
  // **404, not 403.** A case the caller may not reach must not be
  // distinguishable from one that does not exist, or the socket becomes an
  // oracle for which case ids are real.
  'no-such-case': '404 Not Found',
  'too-many': '429 Too Many Requests',
}

/** Refusals made before anybody is known, so they are counted against the address. */
const ANONYMOUS: ReadonlySet<Refusal> = new Set(['no-such-path', 'cross-origin', 'unauthenticated'])

/** The close code for a connection that sent past its budget. */
const TOO_MUCH = 4429

/** Authority that ended on an open connection, and the close code that says which way. */
type Ended = 'unauthenticated' | 'must-change-password' | 'no-such-case'
const CLOSE: Record<Ended, number> = {
  unauthenticated: 4401,
  'must-change-password': 4403,
  'no-such-case': 4404,
}

/** One admitted connection, as authority is read again against it. */
interface Admission {
  caseId: string
  userId: string
  sessionId?: string
  headers: IncomingHttpHeaders
  /** Leaves the roster and lets go of what the connection holds. */
  release?: () => void
  /** Lets go of every row the connection claims, in its frame order. */
  yieldClaims?: () => void
}

/** How often an open connection's authority is read again when it sends nothing. */
const SWEEP_MS = 15_000

/** The largest frame this socket will read, in bytes, sized for a prose sync update. */
const MAX_FRAME_BYTES = 64 * 1024

/** What a claim key may be: a shape, because `live` may not import the collection registry. */
const CLAIM_TABLE = /^[a-z_]{1,40}$/
const CLAIM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** How many rows one connection may hold at once. A browser holds one. */
const CLAIMS_PER_CONNECTION = 64

/** How many frames one connection may have waiting to be acted on before it is ended. */
const FRAMES_WAITING = 256

/** How many connections one account may hold at once, and open: a burst, then one a second. */
const CONNECTIONS_PER_ACCOUNT = 32
const UPGRADES_PER_ACCOUNT = { burst: 60, perSecond: 1 }

/** How many upgrades one address may have refused before anybody is known. */
const ANONYMOUS_REFUSALS_PER_ADDRESS = { burst: 30, perSecond: 0.5 }

/** What one connection may send: a burst, then a steady rate, in frames and in bytes. */
const FRAMES_PER_CONNECTION = { burst: 1_000, perSecond: 100 }
const BYTES_PER_CONNECTION = { burst: 4 * 1024 * 1024, perSecond: 256 * 1024 }

interface OpenDocument {
  /** Which record this document is - a report, or one case note. */
  address: ProseRecord
  doc: Y.Doc
  stop: () => void
}

@Injectable()
export class LiveGateway implements OnModuleInit, BeforeApplicationShutdown {
  private readonly log = new Logger(LiveGateway.name)
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES })
  private connections = 0

  /** Each connection's case and analyst, the session and headers it was admitted with, and how it lets go. */
  private readonly admitted = new Map<WebSocket, Admission>()
  /** The frame types each connection has had refused and recorded, so a repeat writes no second line. */
  private readonly refusalsRecorded = new WeakMap<WebSocket, Set<string>>()
  private readonly carets = new Carets()
  private readonly upgradesByAccount = new Allowances(UPGRADES_PER_ACCOUNT.burst, UPGRADES_PER_ACCOUNT.perSecond)
  private readonly refusalsByAddress = new Allowances(
    ANONYMOUS_REFUSALS_PER_ADDRESS.burst,
    ANONYMOUS_REFUSALS_PER_ADDRESS.perSecond,
  )
  /** Connections each account holds, counted from admission to the socket closing. */
  private readonly holding = new Map<string, number>()
  /** Accounts refused for holding too many since they last opened one, so the run is told once. */
  private readonly crowded = new Set<string>()
  private sweep: NodeJS.Timeout | undefined
  private readonly stopListeningForSessionEnds: () => void
  private readonly stopListeningForReachChanges: () => void

  constructor(
    private readonly channel: CaseChannel,
    private readonly auth: AuthService,
    private readonly prose: ProseService,
    /**
     * **The socket audits itself, because nothing else can.** No guard, pipe,
     * middleware or interceptor runs on an upgrade - so the boundary that
     * records every HTTP write is blind here.
     */
    private readonly activity: InstallActivityService,
    /**
     * **The question the guard asks, asked by hand**, because no guard runs on
     * an upgrade. Read is enough to be admitted; an edit asks again for write.
     */
    private readonly reach: ReachService,
  ) {
    // The ended session's own connections end outright: the library clears its cached copy after telling us.
    this.stopListeningForSessionEnds = onSessionEnded((_userId, sessionId, recorded) => {
      for (const [live, admission] of this.admitted) {
        if (sessionId && admission.sessionId === sessionId) this.end(live, admission, 'unauthenticated', recorded)
      }
    })
    // A revocation reaches a session already open, and ends only the connections it ended.
    this.stopListeningForReachChanges = onReachChanged((userId) => { void this.revalidate(userId) })
  }

  /** A saved change to prose is announced to the case, as any write is. */
  onModuleInit(): void {
    // ponytail: one sweep, O(connections) per 15 s; a deadline per connection if the bound must tighten.
    this.sweep = setInterval(() => {
      for (const [live, admission] of this.admitted) void this.revalidateOne(live, admission)
      this.upgradesByAccount.forgetFull()
      this.refusalsByAddress.forgetFull()
    }, SWEEP_MS)
    this.sweep.unref()
    this.prose.onSaved((caseId, record) => {
      this.channel.announce(caseId, [record.table])
    })
  }

  /** Read again the authority of every connection `userId` holds, and end those it no longer covers. */
  async revalidate(userId: string): Promise<void> {
    for (const [live, admission] of this.admitted) {
      if (admission.userId === userId) await this.revalidateOne(live, admission)
    }
  }

  /** Never rejects: a store that cannot answer leaves the connection for the next pass. */
  private async revalidateOne(live: WebSocket, admission: Admission): Promise<void> {
    try {
      const ended = await this.authorityOf(admission)
      if (ended === 'below-write') admission.yieldClaims?.()
      else if (ended) this.end(live, admission, ended)
    } catch (error) {
      this.log.warn(`could not read a connection's authority again: ${String(error)}`)
    }
  }

  /**
   * Why the session that opened a connection no longer covers it, or null.
   * The same questions the upgrade asked, of the same session, asked now.
   * `below-write` still reads, and may hold no claim. Throws where the session
   * cannot be read, which is not an ending.
   */
  private async authorityOf(admission: Admission): Promise<Ended | 'below-write' | null> {
    if (!admission.sessionId) return 'unauthenticated'
    const session = await this.sessionFor(admission.headers, true)
    if (!session || session.sessionId !== admission.sessionId || session.id !== admission.userId) {
      return 'unauthenticated'
    }
    if (session.held) return 'must-change-password'
    const level = (await this.reach.levelOnCase(admission.userId, admission.caseId))?.level
    if (!level) return 'no-such-case'
    return level === 'write' || level === 'delete' ? null : 'below-write'
  }

  /**
   * A frame refused for its level, recorded as the guard records a refused
   * request, once per connection and frame type: a socket has no request
   * limiter in front of it.
   */
  private recordRefusal(
    live: WebSocket,
    member: Member,
    frame: string,
    reached: { customerId?: string | null; level?: string | null } | null,
  ): void {
    const seen = this.refusalsRecorded.get(live) ?? new Set<string>()
    if (seen.has(frame)) return
    seen.add(frame)
    this.refusalsRecorded.set(live, seen)
    void this.activity.record({
      event: 'access_denied',
      outcome: 'failure',
      actor: { id: member.userId, label: member.username },
      target: `live ${frame}`,
      detail: {
        case: member.caseId,
        ...(reached?.customerId ? { customer: reached.customerId } : {}),
        needed: 'write',
        held: reached?.level ?? 'none',
      },
      headers: this.admitted.get(live)?.headers ?? {},
    })
  }

  /**
   * Close a connection whose authority ended, recording the refusal as the
   * upgrade records one, unless the act that ended it already `recorded` it.
   */
  private end(live: WebSocket, admission: Admission, why: Ended, recorded = false): void {
    if (!this.admitted.delete(live)) return
    if (!recorded) void this.activity.record({
      event: 'live_refused',
      outcome: 'failure',
      actor: { id: admission.userId, label: null },
      target: `live connection: ${why}`,
      detail: { why, case: admission.caseId },
      headers: admission.headers,
    })
    // Released now: a peer that never answers the close would otherwise hold its place for the handshake's timeout.
    admission.release?.()
    live.close(CLOSE[why])
  }

  dropCase(caseId: string): void {
    for (const [live, admission] of this.admitted) {
      if (admission.caseId === caseId) live.terminate()
    }
  }

  /**
   * Called from `main.ts` with the HTTP server, because the upgrade happens
   * below Nest - there is no route to hang it on.
   */
  attach(server: Server): void {
    server.on('upgrade', (request, socket, head) => {
      /**
       * **`void` marks a promise ignored; it does not catch one.** An upgrade
       * that rejects - a Redis closing under it during shutdown is the
       * ordinary case - becomes an unhandled rejection, which vitest reports
       * *beside* a green run and Node may one day make fatal.
       */
      this.upgrade(request, socket, head).catch((error: unknown) => {
        this.log.warn(`refusing an upgrade: ${String(error)}`)
        socket.destroy()
      })
    })
  }

  private async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    // Listened for before the first await: a socket that closes inside one closes once, unheard.
    let counted: string | null = null
    // Node drops its own error listener on an upgrade, so a reset here would be thrown unhandled.
    socket.on('error', () => socket.destroy())
    socket.once('close', () => {
      if (!counted) return
      const now = (this.holding.get(counted) ?? 1) - 1
      if (now > 0) this.holding.set(counted, now)
      else this.holding.delete(counted)
    })
    await attribute(request.headers, request.socket.remoteAddress)
    const verdict = await this.check(request)
    if (verdict.refused && ANONYMOUS.has(verdict.refused)) {
      const address = callerAddress(request.headers) ?? NO_ADDRESS
      const taken = this.refusalsByAddress.take(address)
      if (taken !== 'taken') {
        if (taken === 'first') this.limited(request.headers, null, 'live upgrade', 'address')
        this.refuse(socket, 'too-many')
        return
      }
    }
    if (verdict.refused === 'too-many') {
      this.refuse(socket, 'too-many')
      return
    }
    if (verdict.refused) {
      this.refuse(socket, verdict.refused)
      // A refused upgrade is an authorisation failure, and the one kind the
      // HTTP boundary never sees.
      //
      // **The reason is the target, and the caller's URL is not.** `target` is
      // a partition column of the run window, so a target taken from the URL
      // lets the caller decide whether their own run of refusals is counted as
      // one -- and this path is unauthenticated, so that caller is anybody who
      // can reach the port. The reason is one of a closed set this application
      // wrote. The id they asked for travels in `detail`, which does not
      // partition -- and which a collector receives whole while the activity
      // pane draws no attributes at all, so on the screen it is gone until
      // that pane grows a column. -> #541, #544
      const asked = LIVE_PATH.exec(request.url ?? '')?.[1]?.match(UUID)?.[0].toLowerCase()
      void this.activity.record({
        event: 'live_refused',
        outcome: 'failure',
        target: `live upgrade: ${verdict.refused}`,
        detail: { why: verdict.refused, ...(asked ? { case: asked } : {}) },
        headers: request.headers,
      })
      return
    }

    const userId = verdict.session.id
    if (socket.destroyed) return
    const held = this.holding.get(userId) ?? 0
    if (held >= CONNECTIONS_PER_ACCOUNT) {
      if (!this.crowded.has(userId)) {
        this.crowded.add(userId)
        this.limited(request.headers, verdict.session, 'live upgrade', 'connections')
      }
      this.refuse(socket, 'too-many')
      return
    }
    this.crowded.delete(userId)
    this.holding.set(userId, held + 1)
    counted = userId

    // Who could have edited; who did is the line each saved change writes.
    void this.activity.record({
      event: 'case_opened_live',
      actor: { id: verdict.session.id, label: verdict.session.name },
      target: verdict.caseId,
      headers: request.headers,
    })

    this.sockets.handleUpgrade(request, socket, head, (live) => {
      this.open(live, verdict.caseId, verdict.session, request.headers).catch((error: unknown) => {
        this.log.warn(`could not open a socket: ${String(error)}`)
        live.terminate()
      })
    })
  }

  /**
   * **Refused, not ignored.** An unanswered upgrade stays open in the browser's
   * per-host pool; enough of those and every later request queues forever.
   */
  private refuse(socket: Duplex, why: Refusal): void {
    // Ended rather than destroyed, which can reset the connection before the status is read.
    socket.once('finish', () => socket.destroy())
    socket.end(`HTTP/1.1 ${STATUS[why]}\r\nConnection: close\r\n\r\n`)
  }

  /** One line for a run of limited upgrades or frames, as the throttler writes one for a request. */
  private limited(
    headers: IncomingHttpHeaders,
    actor: { id: string; name: string } | null,
    target: 'live upgrade' | 'live frames',
    tier: 'address' | 'account' | 'connections' | 'connection',
  ): void {
    void this.activity.record({
      event: 'rate_limited',
      ...(actor ? { actor: { id: actor.id, label: actor.name } } : {}),
      target,
      detail: { tier },
      headers,
    })
  }

  /**
   * The whole admission decision, separated from the socket so it is testable.
   *
   * A `ws` handshake cannot be driven from a unit test without a real server;
   * the *decision* can, and the decision is the part with the security in it.
   */
  async check(
    request: IncomingMessage,
  ): Promise<
    | { refused: Refusal }
    | { refused: null; caseId: string; session: { id: string; name: string; held: boolean; sessionId?: string } }
  > {
    const named = LIVE_PATH.exec(request.url ?? '')?.[1]
    if (!named || !UUID.test(named)) return { refused: 'no-such-path' }
    if (!this.sameOrigin(request)) return { refused: 'cross-origin' }

    // One spelling from here on: every key after admission is this string.
    const caseId = named.toLowerCase()
    const session = await this.sessionFor(request.headers)
    if (!session?.sessionId) return { refused: 'unauthenticated' }
    const taken = this.upgradesByAccount.take(session.id)
    if (taken === 'first') this.limited(request.headers, session, 'live upgrade', 'account')
    if (taken !== 'taken') return { refused: 'too-many' }
    // Before the case lookup, so a held account learns nothing about which
    // case ids exist -- the same ordering reason the origin check comes first.
    if (session.held) return { refused: 'must-change-password' }
    if (!(await this.reach.levelOnCase(session.id, caseId))?.level) {
      return { refused: 'no-such-case' }
    }

    return { refused: null, caseId, session }
  }

  /**
   * **The origins sign-in admits, and no others**: the set Better Auth
   * enforces on every credential route, so an ordinary request and a socket
   * cannot disagree about who the install is. A missing `Origin` is refused:
   * every browser sends one on a WebSocket handshake, and this route has no
   * non-browser caller.
   */
  private sameOrigin(request: IncomingMessage): boolean {
    const origin = request.headers.origin
    const trusted = this.auth.instance.options.trustedOrigins
    return typeof origin === 'string' && Array.isArray(trusted) && trusted.includes(origin)
  }

  private async sessionFor(
    given: IncomingHttpHeaders,
    rethrow = false,
  ): Promise<{ id: string; name: string; held: boolean; sessionId?: string } | null> {
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(given)) {
        if (typeof value === 'string') headers.set(name, value)
      }
      const found = await this.auth.api.getSession({ headers })
      if (!found?.user) return null
      return {
        id: found.user.id,
        sessionId: (found.session as { id?: string } | undefined)?.id,
        name: found.user.name?.trim() || found.user.email,
        // `mustChangePassword` is an `additionalFields` column: present at
        // runtime, absent from Better Auth's inferred user type.
        held: (found.user as { mustChangePassword?: boolean }).mustChangePassword === true,
      }
    } catch (error) {
      if (rethrow) throw error
      this.log.warn(`could not read the session off an upgrade: ${String(error)}`)
      return null
    }
  }

  /** One admitted connection. Public so a test can drive one without a server. */
  async open(
    live: WebSocket,
    caseId: string,
    session: { id: string; name: string; sessionId?: string },
    headers: IncomingHttpHeaders = {},
  ): Promise<void> {
    const writer: Writer = { id: session.id, label: session.name, headers }
    this.connections += 1
    const admission: Admission = { caseId, userId: session.id, sessionId: session.sessionId, headers }
    this.admitted.set(live, admission)
    const member: Member = {
      caseId,
      userId: session.id,
      username: session.name,
      // Per connection, so two tabs of one analyst are two writers. Prefixed
      // with the process, so two instances cannot mint the same id.
      sessionId: `${String(process.pid)}-${String(this.connections)}`,
      joinedAt: Date.now(),
      send: (payload) => {
        live.send(payload)
      },
    }

    /**
     * The documents this connection has open, by field.
     *
     * **Per connection, not per case.** Two tabs are two readers of the same
     * report document, and the refcount in `ProseService` is what keeps it
     * alive for the second when the first closes.
     *
     * The promise, not the document: a `reports` change arrives outside the
     * frame sequence, so one announced while a document is still opening has
     * to mark it stale once it has opened.
     */
    const opened = new Map<string, Promise<OpenDocument | null>>()

    /** The rows this connection holds, so `CLAIMS_PER_CONNECTION` is countable. */
    const claims = new Set<string>()

    const joined = this.channel.join(member)
    /**
     * **Settled, not fulfilled.** `PresenceStore.join` starts the heartbeat
     * and `CaseChannel.join` then announces the roster, so a join that rejects
     * in that last step has already armed the interval, and the leave has to
     * run after it anyway. Leaving after a partial join is safe: `leave` clears
     * the interval and deletes keys that may not exist.
     */
    const ready = joined.then(
      () => true,
      () => false,
    )

    /**
     * **Every frame, and then the connection's own end, one at a time in the
     * order they arrived**, all behind the join. A join that failed acts on
     * none of them. -> `openspec/specs/live/design.md`
     */
    let order: Promise<void> = Promise.resolve()
    let waiting = 0

    let gone = false
    const close = () => {
      if (gone) return
      gone = true
      this.admitted.delete(live)
      this.carets.release(live)
      order = order
        .then(async () => {
          await ready
          // **Released before the roster changes.** The last reader out flushes
          // the document, and a closing tab must not leave the report newer in
          // memory than on disk.
          for (const [, held] of opened) (await held.catch(() => null))?.stop()
          opened.clear()
          await this.channel.leave(member)
        })
        .catch((error: unknown) => {
          this.log.warn(`could not release ${member.sessionId}: ${String(error)}`)
        })
    }
    /**
     * **Attached before the join is awaited.** A socket that dies inside that
     * await reaches no handler registered after it, and the heartbeat
     * `PresenceStore.join` started then refreshes the member key for the life
     * of the process -- leaving a case nobody can ever delete, refused in the
     * name of an analyst whose browser is long gone. -> #389
     */
    admission.release = close
    admission.yieldClaims = () => {
      order = order
        .then(async () => {
          // Asked again in order: a claim taken at write since the re-read that queued this stays.
          const level = (await this.reach.levelOnCase(member.userId, member.caseId))?.level
          if (level === 'write' || level === 'delete') return
          for (const field of [...claims]) {
            const at = field.indexOf(':')
            claims.delete(field)
            await this.channel.release(member, field.slice(0, at), field.slice(at + 1))
          }
        })
        .catch((error: unknown) => {
          this.log.warn(`could not release the claims of ${member.sessionId}: ${String(error)}`)
        })
    }
    live.on('close', close)
    live.on('error', close)
    const frames = new Allowances(FRAMES_PER_CONNECTION.burst, FRAMES_PER_CONNECTION.perSecond)
    const bytes = new Allowances(BYTES_PER_CONNECTION.burst, BYTES_PER_CONNECTION.perSecond)
    live.on('message', (raw: Buffer) => {
      if (gone) return
      if (frames.take('') !== 'taken' || bytes.take('', raw.length) !== 'taken') {
        this.limited(headers, session, 'live frames', 'connection')
        close()
        live.close(TOO_MUCH)
        return
      }
      // ponytail: one fixed cap; a per-type budget if a client legitimately bursts past it.
      if (++waiting > FRAMES_WAITING) {
        live.terminate()
        return
      }
      order = order
        .then(async () => {
          // Handled as the analyst the connection admitted, so each read and
          // write a frame makes is scoped to what they reach.
          if (!(await ready)) return
          // Every frame asks whether the session that opened this connection still covers it.
          const ended = await this.authorityOf(admission)
          if (ended === 'below-write') admission.yieldClaims?.()
          else if (ended) {
            this.end(live, admission, ended)
            return
          }
          await actingAs(member.userId, () => this.onFrame(member, writer, live, opened, claims, raw))
        })
        // One failed frame must not stop the ones behind it, nor the leave.
        .catch((error: unknown) => {
          this.log.warn(`could not apply a frame from ${member.sessionId}: ${String(error)}`)
        })
        .finally(() => {
          waiting -= 1
        })
    })

    await joined
  }

  /** One frame from the client, acted on to completion. */
  private async onFrame(
    member: Member,
    writer: Writer,
    live: WebSocket,
    opened: Map<string, Promise<OpenDocument | null>>,
    claims: Set<string>,
    raw: Buffer,
  ): Promise<void> {
    let message: { type?: unknown; table?: unknown; id?: unknown; field?: unknown; update?: unknown } | null
    try {
      message = JSON.parse(raw.toString()) as typeof message
    } catch {
      return // A frame this build does not understand is ignored, not fatal.
    }
    // `null` parses, and reading a field off it throws.
    if (typeof message !== 'object' || message === null) return

    /**
     * **Prose is routed before the claim gate**, which requires `table` and
     * `id` and returns early without them. A prose frame carries `field` and
     * `update` instead, so leaving it below that check is a socket that
     * silently drops every keystroke - which is exactly what it did.
     */
    if (message.type === 'prose.sync' || message.type === 'prose.awareness') {
      const field = typeof message.field === 'string' ? message.field : null
      const update = typeof message.update === 'string' ? message.update : null
      if (!field || !update) return
      await this.onProse(member, writer, live, opened, message.type, field, update)
      return
    }

    const table = typeof message.table === 'string' ? message.table : null
    const id = typeof message.id === 'string' ? message.id.toLowerCase() : null
    if (!table || !id) return

    if (message.type === 'claim') await this.onClaim(member, live, claims, table, id)
    if (message.type === 'release') {
      claims.delete(`${table}:${id}`)
      await this.channel.release(member, table, id)
    }
  }

  /**
   * One claim frame. A claim says its holder is editing, so it takes write on
   * the case; admission asked only for read. `release` is not gated:
   * `PresenceStore.release` refuses a field another session holds.
   */
  private async onClaim(
    member: Member,
    live: WebSocket,
    claims: Set<string>,
    table: string,
    id: string,
  ): Promise<void> {
    // Silence, as for a frame this build does not understand: no client sends this shape.
    if (!CLAIM_TABLE.test(table) || !CLAIM_ID.test(id)) return
    const field = `${table}:${id}`
    if (!claims.has(field) && claims.size >= CLAIMS_PER_CONNECTION) return

    const reached = await this.reach.levelOnCase(member.userId, member.caseId)
    if (reached?.level !== 'write' && reached?.level !== 'delete') {
      live.send(JSON.stringify({ type: 'claim.refused', table, id, reason: 'read-only' }))
      this.recordRefusal(live, member, 'claim', reached)
      return
    }
    claims.add(field)
    await this.channel.claim(member, table, id)
  }

  /**
   * One prose frame: sync or awareness.
   *
   * **Awareness is relayed as the connection's own carets, named for its
   * analyst** -> `Carets`. Carets are not stored.
   * A sync frame is applied to the server's own document first, since that
   * document is the record; the answer goes to the sender and the update to
   * everyone else.
   *
   * **A sent report's field is readable and not writable**: `ProseService`
   * answers a frame carrying content with the report's stamp, and the text
   * still loads.
   */
  private async onProse(
    member: Member,
    writer: Writer,
    live: WebSocket,
    opened: Map<string, Promise<OpenDocument | null>>,
    type: 'prose.sync' | 'prose.awareness',
    field: string,
    update: string,
  ): Promise<void> {
    if (type === 'prose.awareness') {
      // Relayed on the field alone: an awareness frame for a field this
      // connection never opened is still somebody's caret.
      const vouched = this.carets.vouch(member.caseId, live, member.userId, member.username, Buffer.from(update, 'base64'))
      if (vouched) {
        this.channel.prose(member.caseId, { type, field, update: Buffer.from(vouched).toString('base64') }, member.sessionId)
      }
      return
    }

    let opening = opened.get(field)
    const opens = !opening
    if (!opening) {
      // **In the map before the first await.** -> `open`
      opening = this.openDocument(member, live, field)
      opened.set(field, opening)
    }
    let held
    try {
      held = await opening
    } catch (error) {
      opened.delete(field)
      throw error
    }
    if (!held) {
      opened.delete(field)
      return
    }

    const frame = Buffer.from(update, 'base64')

    // Admission asked only for read, so an edit asks for write. A state request
    // and a frame adding nothing are not edits: a read-only analyst sends both
    // to catch up.
    if (!this.prose.isStateRequest(frame)) {
      const reached = await this.reach.levelOnCase(member.userId, member.caseId)
      if (reached?.level !== 'write' && reached?.level !== 'delete' && !this.prose.addsNothing(held.doc, frame)) {
        live.send(
          JSON.stringify({
            type: 'prose.refused',
            field,
            reason: 'read-only',
          }),
        )
        this.recordRefusal(live, member, 'prose.sync', reached)
        return
      }
    }

    const applied = await this.prose.apply(member.caseId, held.address, frame, live, writer)
    /**
     * **Told, not dropped.** A silently discarded update is the worst outcome
     * on this path: the analyst types, sees their own text, and it reaches
     * nobody and nothing. It names what the 409 at the HTTP door names: the
     * field and when the report was filed.
     */
    if ('refused' in applied) {
      live.send(
        JSON.stringify({
          type: 'prose.refused',
          field,
          reason: 'report-sent',
          sentAt: applied.refused.toISOString(),
        }),
      )
      return
    }

    const { reply } = applied
    // The server's own step 1 goes after the answer, so the client is ready first.
    for (const bytes of [reply, opens ? this.prose.hello(held.doc) : null]) {
      if (!bytes) continue
      live.send(
        JSON.stringify({
          type: 'prose.sync',
          field,
          update: Buffer.from(bytes).toString('base64'),
        }),
      )
    }
  }

  /**
   * Take a reader on one field's document and wire its updates to this socket.
   * Null when the field does not resolve, which the caller answers with silence
   * so the socket says nothing about which block ids exist in other cases.
   */
  private async openDocument(
    member: Member,
    live: WebSocket,
    field: string,
  ): Promise<OpenDocument | null> {
    const address = await this.prose.resolve(member.caseId, field)
    if (!address) return null

    const doc = await this.prose.open(member.caseId, address)

    const onUpdate = (bytes: Uint8Array, origin: unknown) => {
      if (origin === live) return
      live.send(
        JSON.stringify({
          type: 'prose.sync',
          field,
          update: Buffer.from(this.prose.frameUpdate(bytes)).toString('base64'),
        }),
      )
    }
    doc.on('update', onUpdate)

    return {
      address,
      doc,
      stop: () => {
        doc.off('update', onUpdate)
        // As in `attach`: a release racing a closing Redis rejects, which `void` would leak.
        this.prose.release(member.caseId, address).catch((error: unknown) => {
          this.log.warn(`could not release ${field}: ${String(error)}`)
        })
      },
    }
  }

  /**
   * **Every client is terminated, not just the server closed.**
   * `WebSocketServer.close()` stops new upgrades and leaves open connections
   * alive, and an open socket keeps the event loop running - so the process
   * never exits, the port stays bound, and the next `nest start --watch`
   * rebuild compiles cleanly and then cannot listen. One leftover socket from
   * a probe is enough to hold the old process.
   */
  beforeApplicationShutdown(): void {
    clearInterval(this.sweep)
    this.stopListeningForSessionEnds()
    this.stopListeningForReachChanges()
    for (const live of this.sockets.clients) live.terminate()
    this.sockets.close()
  }
}
