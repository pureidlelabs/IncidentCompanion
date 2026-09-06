/**
 * One socket per case, shared by everything that speaks over it.
 *
 * **Why a module-level registry and not a context.** The server counts
 * *connections* to build the roster, so a second socket for the same case
 * shows the analyst twice in their own avatar stack. Presence is rendered in
 * `CaseShell`'s header and prose sync is rendered inside whichever section has
 * focus - nothing sensible is a common ancestor of both, and a context that
 * has to be mounted above both is a rule enforced by memory. Keying on the
 * case id makes one-socket-per-case true by construction: a second consumer
 * cannot get a second socket even by asking.
 *
 * **Refcounted, so the last consumer closes it.** A case left open with no
 * subscribers would keep an occupant in the roster and block the delete.
 *
 * ## `onConnected` is the important half, not `send`
 *
 * A reconnect is not transparent: the server drops every claim held by a
 * socket when it closes, and it has no memory of which prose fields this tab
 * had open. So state announced over this socket has to be announced *again*
 * on each connect, by the consumer that owns it. That is what this exposes,
 * and why there is no outbound queue - a queue would replay the first
 * connect's messages and still lose everything after a drop.
 */

/** Enough of `WebSocket` to run against, and to fake in a tier that has none. */
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(): void
  // **The DOM's own parameter types, not `unknown`.** A handler taking
  // `unknown` is not assignable *from* one taking `Event` under
  // `strictFunctionTypes`, so the loose-looking version is the one a real
  // `WebSocket` fails to satisfy.
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
}

export type SocketFactory = (url: string) => SocketLike

/** `WebSocket.OPEN`, spelled out: jsdom defines no `WebSocket` to read it off. */
const OPEN = 1

const FIRST_RETRY_MS = 500
const MAX_RETRY_MS = 10_000

export type Message = Record<string, unknown>

export interface CaseLink {
  /** Dropped when the socket is down. Re-announce from `onConnected`. */
  send(message: Message): void
  /** Every decoded text frame, in arrival order. */
  subscribe(listener: (message: Message) => void): () => void
  /**
   * Told on every connect and every drop, and **called immediately** with the
   * current state - a consumer mounting into an already-open socket has the
   * same announcing to do as one that was there when it opened.
   */
  onConnected(listener: (up: boolean) => void): () => void
  readonly connected: boolean
}

export function socketUrl(caseId: string, location = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}/api/cases/${encodeURIComponent(caseId)}/live`
}

export function decode(data: unknown): Message | null {
  if (typeof data !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return parsed as Message
}

class Link implements CaseLink {
  private socket: SocketLike | null = null
  private readonly listeners = new Set<(message: Message) => void>()
  private readonly watchers = new Set<(up: boolean) => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private retry = FIRST_RETRY_MS
  private shut = false
  connected = false

  constructor(
    private readonly caseId: string,
    private readonly make: SocketFactory,
  ) {
    this.open()
  }

  private open(): void {
    if (this.shut) return
    const live = this.make(socketUrl(this.caseId))
    this.socket = live

    live.onopen = () => {
      this.retry = FIRST_RETRY_MS
      this.connected = true
      for (const watch of [...this.watchers]) watch(true)
    }
    live.onmessage = (event) => {
      const message = decode(event.data)
      if (!message) return
      // **Each listener is isolated.** Presence and prose share this socket,
      // so a payload the prose reader chokes on would otherwise stop the
      // roster from ever updating again -- one bad frame, and the avatar
      // stack is frozen for the rest of the session.
      for (const listen of [...this.listeners]) {
        try {
          listen(message)
        } catch (error) {
          console.error('case socket listener failed', error)
        }
      }
    }
    live.onclose = () => {
      this.connected = false
      for (const watch of [...this.watchers]) watch(false)
      if (this.shut) return
      this.timer = setTimeout(() => this.open(), this.retry)
      this.retry = Math.min(this.retry * 2, MAX_RETRY_MS)
    }
    // `onerror` is deliberately unhandled: every error is followed by a close,
    // and reconnecting from both schedules two sockets.
  }

  send(message: Message): void {
    if (this.socket?.readyState === OPEN) this.socket.send(JSON.stringify(message))
  }

  subscribe(listener: (message: Message) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  onConnected(listener: (up: boolean) => void): () => void {
    this.watchers.add(listener)
    listener(this.connected)
    return () => { this.watchers.delete(listener) }
  }

  shutdown(): void {
    this.shut = true
    if (this.timer) clearTimeout(this.timer)
    this.socket?.close()
    this.socket = null
  }
}

const LINKS = new Map<string, { link: Link; refs: number }>()

export function acquireLink(caseId: string, make: SocketFactory): CaseLink {
  const held = LINKS.get(caseId)
  if (held) {
    held.refs += 1
    return held.link
  }
  const link = new Link(caseId, make)
  LINKS.set(caseId, { link, refs: 1 })
  return link
}

export function releaseLink(caseId: string): void {
  const held = LINKS.get(caseId)
  if (!held) return
  held.refs -= 1
  if (held.refs > 0) return
  LINKS.delete(caseId)
  held.link.shutdown()
}

/** How many consumers hold this case's socket. For tests. */
export function heldBy(caseId: string): number {
  return LINKS.get(caseId)?.refs ?? 0
}
