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
 * - **Origin, against Host.** WebSocket handshakes are *not* subject to CORS,
 *   so without this any website an analyst visits can open a socket carrying
 *   their cookie and read the case - cross-site WebSocket hijacking. There is
 *   no preflight to stop it and the browser sends the cookie regardless.
 * - **A session**, from the same cookie every request carries. Otherwise the
 *   roster shows names nobody proved.
 * - **Access to *that case*.** Authenticating and then trusting the id in the
 *   path is the classic IDOR: any signed-in analyst could open a socket on any
 *   case uuid and receive its presence and every change announcement. The HTTP
 *   routes have `CaseAccessGuard`; this is that check, run by hand.
 *
 * - **A password the account chose itself.** `MustChangePasswordInterceptor`
 *   returns `next.handle()` for any non-HTTP context, so a held account is
 *   refused every route and reaches this one. It can otherwise read the
 *   change feed and claim rows, refusing other analysts' writes.
 *
 * `live.gateway.test.ts` asserts all four, because a missing one is invisible.
 */
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { AuthService } from '@thallesp/nestjs-better-auth'
import { eq } from 'drizzle-orm'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type * as Y from 'yjs'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { cases } from '../db/schema/index.js'
import { CaseChannel, type Member } from './case-channel.service.js'
import { ProseService, type ProseAddress } from '../prose/prose.service.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { onSessionEnded } from '../auth/session-ended.js'

/** `/api/cases/<uuid>/live`, and nothing else on the socket. */
const LIVE_PATH = /^\/api\/cases\/([0-9a-f-]{36})\/live$/i

/** Why an upgrade was refused. Returned rather than logged, so a test can read it. */
export type Refusal =
  | 'no-such-path'
  | 'cross-origin'
  | 'unauthenticated'
  | 'must-change-password'
  | 'no-such-case'

const STATUS: Record<Refusal, string> = {
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
}

/**
 * The scope a filing moves, as `case-channel.service.ts` announces it.
 *
 * Spelled once: the fan-out names scopes as strings, so a typo here is a
 * watcher that never fires and a window that never closes, with nothing red.
 * `live.gateway.test.ts` drives the real string through a real frame.
 */
const REPORTS_SCOPE = 'reports'

/** One document this connection has open, and what it may do to it. */
interface OpenDocument {
  /** Which record this document is - a report, or one case note. */
  address: ProseAddress
  doc: Y.Doc
  /**
   * When the record was frozen, or null. Refreshed on open and whenever
   * `stale` is set, never per frame. **Always null for a note**, which has no
   * state that refuses a write.
   */
  sentAt: Date | null
  stale: boolean
  stop: () => void
}

@Injectable()
export class LiveGateway implements OnApplicationShutdown {
  private readonly log = new Logger(LiveGateway.name)
  private readonly sockets = new WebSocketServer({ noServer: true })
  private connections = 0

  /** Every admitted connection, by the case and the analyst it was opened for. */
  private readonly admitted = new Map<WebSocket, { caseId: string; userId: string }>()
  private readonly stopListeningForSessionEnds: () => void

  constructor(
    private readonly channel: CaseChannel,
    private readonly auth: AuthService,
    @Inject(DATABASE) private readonly db: Database,
    private readonly prose: ProseService,
    /**
     * **The socket audits itself, because nothing else can.** No guard, pipe,
     * middleware or interceptor runs on an upgrade - so the boundary that
     * records every HTTP write is blind here, and this is the one path that
     * persists a report.
     */
    private readonly activity: InstallActivityService,
  ) {
    this.stopListeningForSessionEnds = onSessionEnded((userId) => { this.dropUser(userId) })
  }

  /** Ends every connection admitted for one analyst. */
  dropUser(userId: string): void {
    for (const [live, admission] of this.admitted) {
      if (admission.userId === userId) live.terminate()
    }
  }

  /** Ends every connection open on one case. */
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
       * *beside* a green run and Node may one day make fatal. Measured
       * 2026-08-12: `Errors 1` against `1648 passed`.
       */
      this.upgrade(request, socket, head).catch((error: unknown) => {
        this.log.warn(`refusing an upgrade: ${String(error)}`)
        socket.destroy()
      })
    })
  }

  private async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const verdict = await this.check(request)
    if (verdict.refused) {
      // **Refused, not ignored.** An unanswered upgrade stays open in the
      // browser's per-host pool; enough of those and every later request
      // queues forever. That failure cost an evening on the Vite proxy side.
      socket.write(`HTTP/1.1 ${STATUS[verdict.refused]}\r\n\r\n`)
      socket.destroy()
      // A refused upgrade is an authorisation failure, and the one kind the
      // HTTP boundary never sees.
      void this.activity.record({
        event: 'live_refused',
        outcome: 'failure',
        target: request.url ?? null,
        detail: { why: verdict.refused },
        headers: request.headers,
      })
      return
    }

    /**
     * **One line per opening, not per write.** The document is a CRDT flushed
     * on a timer, so a line per flush would be a line every few seconds per
     * reader; the question an audit is read for is *who could have edited
     * this*, and that is answered when the socket opens.
     */
    void this.activity.record({
      event: 'case_opened_live',
      actor: { id: verdict.session.id, label: verdict.session.name },
      target: verdict.caseId,
      headers: request.headers,
    })

    this.sockets.handleUpgrade(request, socket, head, (live) => {
      this.open(live, verdict.caseId, verdict.session).catch((error: unknown) => {
        this.log.warn(`could not open a socket: ${String(error)}`)
        live.terminate()
      })
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
    | { refused: null; caseId: string; session: { id: string; name: string; held: boolean } }
  > {
    const match = LIVE_PATH.exec(request.url ?? '')
    if (!match) return { refused: 'no-such-path' }
    if (!this.sameOrigin(request)) return { refused: 'cross-origin' }

    const caseId = match[1]!
    const session = await this.sessionFor(request)
    if (!session) return { refused: 'unauthenticated' }
    // Before the case lookup, so a held account learns nothing about which
    // case ids exist -- the same ordering reason the origin check comes first.
    if (session.held) return { refused: 'must-change-password' }
    if (!(await this.mayReach(caseId))) return { refused: 'no-such-case' }

    return { refused: null, caseId, session }
  }

  /**
   * **Same-origin, compared against `Host` rather than a configured list.**
   * The app is served from whatever address it was started on - a port picked
   * at runtime, a container publish, an analyst's own hostname - so a fixed
   * allowlist is one more thing to keep true. A missing `Origin` is refused:
   * every browser sends one on a WebSocket handshake, and this route has no
   * non-browser caller.
   */
  private sameOrigin(request: IncomingMessage): boolean {
    const origin = request.headers.origin
    const host = request.headers.host
    if (typeof origin !== 'string' || typeof host !== 'string') return false
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  private async sessionFor(
    request: IncomingMessage,
  ): Promise<{ id: string; name: string; held: boolean } | null> {
    try {
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') headers.set(name, value)
      }
      const found = await this.auth.api.getSession({ headers })
      if (!found?.user) return null
      return {
        id: found.user.id,
        name: found.user.name?.trim() || found.user.email,
        // `mustChangePassword` is an `additionalFields` column: present at
        // runtime, absent from Better Auth's inferred user type.
        held: (found.user as { mustChangePassword?: boolean }).mustChangePassword === true,
      }
    } catch (error) {
      this.log.warn(`could not read the session off an upgrade: ${String(error)}`)
      return null
    }
  }

  /**
   * **What `CaseAccessGuard` does, and no more.** Today that is existence: the
   * install has no per-case authorization yet, which is an open decision for a
   * deployment holding several customers. It is its own method so the day that
   * lands, this is where it lands - rather than being missed because a socket
   * is not a route and no guard runs on it.
   */
  private async mayReach(caseId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId))
    return row !== undefined
  }

  /** One admitted connection. Public so a test can drive one without a server. */
  async open(
    live: WebSocket,
    caseId: string,
    session: { id: string; name: string },
  ): Promise<void> {
    this.connections += 1
    this.admitted.set(live, { caseId, userId: session.id })
    const member: Member = {
      caseId,
      userId: session.id,
      username: session.name,
      // Per connection, so two tabs of one analyst are two writers. Prefixed
      // with the process, so two instances cannot mint the same id.
      sessionId: `${String(process.pid)}-${String(this.connections)}`,
      joinedAt: Date.now(),
      /**
       * **Watched on the way past, not intercepted.** Every frame the case
       * fans out already reaches this connection; a `reports` change is the
       * one that can have filed a document somebody here has open, so it
       * drops the cached stamp rather than costing a query per keystroke.
       * Anything unparseable is forwarded untouched - this is a listener on
       * the way to the socket, and must never be able to swallow a frame.
       */
      send: (payload) => {
        try {
          const frame = JSON.parse(payload) as { type?: unknown; scopes?: unknown }
          if (
            frame.type === 'case.changed' &&
            Array.isArray(frame.scopes) &&
            frame.scopes.includes(REPORTS_SCOPE)
          ) {
            for (const [, held] of opened) held.stale = true
          }
        } catch {
          // Not JSON, or not a shape this knows. Forwarded regardless.
        }
        live.send(payload)
      },
    }

    await this.channel.join(member)

    /**
     * The documents this connection has open, by field.
     *
     * **Per connection, not per case.** Two tabs are two readers of the same
     * report document, and the refcount in `ProseService` is what keeps it
     * alive for the second when the first closes.
     */
    const opened = new Map<string, OpenDocument>()

    live.on('message', (raw: Buffer) => {
      let message: { type?: unknown; table?: unknown; id?: unknown; field?: unknown; update?: unknown }
      try {
        message = JSON.parse(raw.toString()) as typeof message
      } catch {
        return // A frame this build does not understand is ignored, not fatal.
      }

      // Caught: a frame from the client is not awaited, so a store failure
      // here would otherwise be an unhandled rejection and the process.
      const failed = (error: unknown) => {
        this.log.warn(`could not apply a ${String(message.type)}: ${String(error)}`)
      }

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
        this.onProse(member, live, opened, message.type, field, update).catch(failed)
        return
      }

      const table = typeof message.table === 'string' ? message.table : null
      const id = typeof message.id === 'string' ? message.id : null
      if (!table || !id) return

      if (message.type === 'claim') this.channel.claim(member, table, id).catch(failed)
      if (message.type === 'release') this.channel.release(member, table, id).catch(failed)
    })

    const close = () => {
      this.admitted.delete(live)
      // **Released before the roster changes.** The last reader out flushes
      // the document, and a closing tab must not leave the report newer in
      // memory than on disk.
      for (const [, held] of opened) held.stop()
      opened.clear()
      this.channel.leave(member).catch((error: unknown) => {
        this.log.warn(`could not release ${member.sessionId}: ${String(error)}`)
      })
    }
    live.on('close', close)
    live.on('error', close)
  }


  /**
   * One prose frame: sync or awareness.
   *
   * **Awareness is relayed and never interpreted** - carets are not stored.
   * A sync frame is applied to the server's own document first, since that
   * document is the record; the answer goes to the sender and the update to
   * everyone else.
   *
   * **A sent report's field is readable and not writable**, the same refusal
   * `freeze.ts` makes at every collection door. The gate is per *frame*, not
   * on `resolve` or `open`, so the text still loads and only a frame carrying
   * content is refused. **A note never reaches it**: `resolve` answers a note
   * with `sentAt: null` because there is no state a note can be in that
   * refuses a write, so the branch below is dead for one of the two tables
   * rather than being skipped for it.
   *
   * The sent state is re-read when `case.changed` says reports moved, never
   * per frame - reading it once leaves a connection holding the field taking
   * updates into a report that has since been filed.
   */
  private async onProse(
    member: Member,
    live: WebSocket,
    opened: Map<string, OpenDocument>,
    type: 'prose.sync' | 'prose.awareness',
    field: string,
    update: string,
  ): Promise<void> {
    if (type === 'prose.awareness') {
      // Relayed on the field alone: an awareness frame for a field this
      // connection never opened is still somebody's caret, and refusing it
      // would need the roster this deliberately does not keep.
      this.channel.prose(member.caseId, { type, field, update }, member.sessionId)
      return
    }

    let held = opened.get(field)
    if (!held) {
      const address = await this.prose.resolve(member.caseId, field)
      // **Unresolvable is silence, not an error frame.** The field key comes
      // from a browser; answering "no such field" would make the socket an
      // oracle for which block ids exist in other cases.
      if (!address) return

      const doc = await this.prose.open(member.caseId, address)
      const { sentAt } = address

      // Every later update to the shared document reaches this connection,
      // whichever client caused it.
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

      held = {
        address,
        doc,
        sentAt,
        stale: false,
        stop: () => {
          doc.off('update', onUpdate)
          // Same rule as `attach`: a release racing a closing Redis rejects,
          // and `void` would let it escape as an unhandled rejection.
          this.prose.release(member.caseId, address).catch((error: unknown) => {
            this.log.warn(`could not release ${field}: ${String(error)}`)
          })
        },
      }
      opened.set(field, held)
    }

    /**
     * **Re-read once, then decided.** The fan-out only says *reports moved*,
     * so the stamp is fetched again rather than assumed to be a filing: a
     * label edited on another report would otherwise freeze this one.
     */
    if (held.stale) {
      const fresh = await this.prose.resolve(member.caseId, field)
      held.sentAt = fresh?.sentAt ?? held.sentAt
      held.stale = false
    }

    const frame = Buffer.from(update, 'base64')

    /**
     * **Told, not dropped.** A silently discarded update is the worst outcome
     * on this path: the analyst types, sees their own text, and it reaches
     * nobody and nothing. This is the socket's form of the 409 `freeze.ts`
     * raises at the HTTP door, and it names the same two things - the field
     * and when the report was filed.
     */
    if (held.sentAt && !this.prose.isStateRequest(frame)) {
      live.send(
        JSON.stringify({
          type: 'prose.refused',
          field,
          reason: 'report-sent',
          sentAt: held.sentAt.toISOString(),
        }),
      )
      return
    }

    const reply = this.prose.applySync(held.doc, frame, live)
    if (reply) {
      live.send(
        JSON.stringify({
          type: 'prose.sync',
          field,
          update: Buffer.from(reply).toString('base64'),
        }),
      )
    }
  }

  /**
   * **Every client is terminated, not just the server closed.**
   * `WebSocketServer.close()` stops new upgrades and leaves open connections
   * alive, and an open socket keeps the event loop running - so the process
   * never exits, the port stays bound, and the next `nest start --watch`
   * rebuild compiles cleanly and then cannot listen. Measured: one leftover
   * socket from a probe held the old process for three minutes.
   */
  onApplicationShutdown(): void {
    this.stopListeningForSessionEnds()
    for (const live of this.sockets.clients) live.terminate()
    this.sockets.close()
  }
}
