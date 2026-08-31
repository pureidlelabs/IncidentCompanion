/**
 * **The case socket, driven end to end.**
 *
 * Multi-user is the premise the whole product is built on - presence, claims
 * and a repaint on every write - and until now no test opened a socket. The
 * gateway's own file says why: *"a `ws` handshake cannot be driven from a unit
 * test without a real server; the decision can, and the decision is the part
 * with the security in it."* That was the right call while there was no server
 * to drive. There is one now, and it covers the half the decision cannot:
 * whether the decision is *wired to* the upgrade at all, and what the socket
 * does once it is open.
 *
 * **The refusals are asserted over the wire deliberately.** `check()` returning
 * `cross-origin` is a fact about a function; a browser being unable to open the
 * socket from another site is a fact about the app, and only one of them is the
 * security property. A gateway that computed every verdict correctly and never
 * consulted them would pass the unit tests and fail here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

/** Every socket a test opened, so teardown can wait for each to shut. */
const open: WebSocket[] = []

/** Closes one socket and waits for the close to actually happen. */
function shut(socket: WebSocket): Promise<void> {
  if (socket.readyState === socket.CLOSED) return Promise.resolve()
  return new Promise((resolve) => {
    socket.once('close', () => {
      resolve()
    })
    socket.close()
    // A socket the server already dropped never emits close here.
    setTimeout(resolve, 2000)
  })
}

/** Resolves to the close code when the handshake is refused, or 'open'. */
function tryOpen(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url, { headers })
    const settle = (answer: string): void => {
      socket.removeAllListeners()
      /**
       * **A listener has to survive the teardown.** Three of the four cases
       * here are handshakes the server refused, and tearing one of those down
       * emits an error - *"WebSocket was closed before the connection was
       * established"*. With every listener already removed it has nowhere to
       * go and becomes an uncaught exception, which vitest reports beside a
       * green run and exits non-zero for.
       */
      socket.on('error', () => {
        // Settled already; the verdict is the answer below.
      })
      socket.terminate()
      resolve(answer)
    }
    socket.on('open', () => {
      settle('open')
    })
    // `ws` reports a refused upgrade as an error carrying the status line.
    socket.on('unexpected-response', (_req, res) => {
      settle(`refused:${String(res.statusCode)}`)
    })
    socket.on('error', (error: Error) => {
      settle(`error:${error.message}`)
    })
  })
}

describe.skipIf(!runnable)('the case socket', () => {
  let harness: Harness
  let admin: Persona
  let caseId: string
  let wsBase: string
  let origin: string

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)

    /**
     * **The gateway is attached by the harness's platform layer**, and was
     * attached again here until 2026-08-12. A second `handleUpgrade` on the
     * same socket is not a duplicate that cancels out: `ws` rejects it, and it
     * surfaces as an unhandled rejection *beside* a green run rather than as a
     * failure - so the suite reported 1640 passed and two errors.
     */
    admin = await sharedAdmin(harness)
    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    caseId = cases[0]!.id

    origin = harness.base
    wsBase = harness.base.replace('http://', 'ws://')
  }, 90_000)

  afterAll(async () => {
    /**
     * **Closed and awaited, not just asked to close.** Tearing the app down
     * with sockets still open leaves ioredis rejecting `Connection is closed`
     * after the run - the suite reports every test green and exits non-zero,
     * which on CI is a red build with nothing to look at.
     */
    await Promise.all(open.map(shut))
    open.length = 0
    /**
     * **No wait here, and that is the point.** A closing socket announces the
     * analyst's departure *after* the socket is gone, so tearing the app down
     * used to close Redis under a pending command and produce `Connection is
     * closed` as an unhandled rejection - a run that exits non-zero with every
     * test green. A 500ms sleep masked it; the store now tracks what is in
     * flight and drains it in `onApplicationShutdown`, which is the same idea
     * without the guess. -> `live/presence.store.ts`
     */
    await harness?.close()
  })

  const liveUrl = (id = caseId): string => `${wsBase}/api/cases/${id}/live`

  it('opens for a signed-in analyst on the case', async () => {
    const answer = await tryOpen(liveUrl(), { cookie: admin.cookie, origin })
    expect(answer).toBe('open')
  }, 30_000)

  /**
   * **Cross-site WebSocket hijacking, and the browser will not stop it.** A
   * handshake is not subject to CORS, so a page on another origin can open this
   * socket with the analyst's cookie attached unless the server refuses it.
   */
  it('refuses a handshake from another origin', async () => {
    const answer = await tryOpen(liveUrl(), {
      cookie: admin.cookie,
      origin: 'https://not-this-app.invalid',
    })
    expect(answer).not.toBe('open')
  }, 30_000)

  it('refuses a handshake with no session', async () => {
    const answer = await tryOpen(liveUrl(), { origin })
    expect(answer).not.toBe('open')
  }, 30_000)

  /**
   * **The case id in the path is the classic IDOR**, so a socket on a case that
   * does not exist must be refused rather than opened and left empty.
   */
  it('refuses a socket on a case that does not exist', async () => {
    const answer = await tryOpen(liveUrl('00000000-0000-4000-8000-000000000000'), {
      cookie: admin.cookie,
      origin,
    })
    expect(answer).not.toBe('open')
  }, 30_000)

  /**
   * **What the product is for**: the second analyst is announced to the first.
   * Presence rides the socket, so nothing below the socket can prove it.
   */
  it('tells one analyst that another has arrived', async () => {
    const first = new WebSocket(liveUrl(), { headers: { cookie: admin.cookie, origin } })
    open.push(first)
    const heard: unknown[] = []
    await new Promise<void>((resolve, reject) => {
      first.on('open', () => {
        resolve()
      })
      first.on('error', reject)
    })
    first.on('message', (raw: Buffer) => {
      heard.push(JSON.parse(raw.toString('utf8')))
    })

    const second = new WebSocket(liveUrl(), { headers: { cookie: admin.cookie, origin } })
    open.push(second)
    await new Promise<void>((resolve, reject) => {
      second.on('open', () => {
        resolve()
      })
      second.on('error', reject)
    })

    // Presence is announced through Redis, so this is not synchronous with the
    // handshake; poll rather than sleep a fixed time.
    const arrived = await waitFor(() => heard.length > 0, 8000)
    await Promise.all([shut(first), shut(second)])

    expect(arrived, `first socket heard nothing: ${JSON.stringify(heard)}`).toBe(true)
  }, 40_000)
})

/** Polls a condition rather than sleeping, so a slow machine does not flake. */
async function waitFor(ready: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (ready()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return ready()
}
