/**
 * **The case socket, driven end to end.**
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import {
  boot,
  bootable,
  grantsItselfDelete,
  seedDemoContent,
  sharedAdmin,
  signIn,
  type Harness,
  type Persona,
} from './app-harness.js'

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
       * **A listener has to survive the teardown.**
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
     * attached again here until 2026-08-12.
     */
    admin = await sharedAdmin(harness)
    // **Deleting a case needs `delete`, and the default customer's guarantee
    // stops at write** -- so the administrator takes the path the requirement
    // names: make a group, put the customer in it, join at delete. The grant
    // is logged naming them as both grantor and subject, which is what the
    // product offers in place of a restriction.
    await grantsItselfDelete(harness, admin)
    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    caseId = cases[0]!.id

    origin = harness.base
    wsBase = harness.base.replace('http://', 'ws://')
  }, 90_000)

  afterAll(async () => {
    /**
     * **Closed and awaited, not just asked to close.**
     */
    await Promise.all(open.map(shut))
    open.length = 0
    /**
     * **No wait here, and that is the point.**
     */
    await harness?.close()
  })

  const liveUrl = (id = caseId): string => `${wsBase}/api/cases/${id}/live`

  it('opens for a signed-in analyst on the case', async () => {
    const answer = await tryOpen(liveUrl(), { cookie: admin.cookie, origin })
    expect(answer).toBe('open')
  }, 30_000)

  /**
   * **Cross-site WebSocket hijacking, and the browser will not stop it.**
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

  /**
   * **The reach that admitted a connection can be withdrawn after it opens.**
   */
  describe('the connection dies with the reach that admitted it', () => {
    const ISSUED = 'live-socket-issued-1234'

    /** An analyst of this test's own - disabling one is destructive, and `sharedAnalyst` is shared. */
    async function freshAnalyst(email: string): Promise<Persona> {
      const created = await fetch(`${harness.base}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({
          username: email,
          displayName: 'Live socket harness',
          password: ISSUED,
          role: 'analyst',
        }),
      })
      if (!created.ok) {
        throw new Error(`creating ${email} answered ${created.status}: ${await created.text()}`)
      }
      const held = await signIn(harness, email, ISSUED)
      const changed = await fetch(`${harness.base}/api/change-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: held.cookie },
        body: JSON.stringify({
          current: ISSUED,
          password: 'live-socket-password-1234',
          repeat: 'live-socket-password-1234',
        }),
      })
      if (!changed.ok) {
        throw new Error(`${email} could not set its own password: ${changed.status}`)
      }
      return signIn(harness, email, 'live-socket-password-1234')
    }

    it("closes when an administrator ends the analyst's session", async () => {
      const email = `live-revoked-${process.pid}@harness.test`
      const analyst = await freshAnalyst(email)

      const socket = new WebSocket(liveUrl(), { headers: { cookie: analyst.cookie, origin } })
      open.push(socket)
      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => {
          resolve()
        })
        socket.on('error', reject)
      })

      const disabled = await fetch(`${harness.base}/api/accounts/${email}/disable`, {
        method: 'POST',
        headers: { cookie: admin.cookie },
      })
      expect(disabled.ok).toBe(true)

      const closed = await waitFor(() => socket.readyState === socket.CLOSED, 8000)
      expect(closed, 'the socket outlived the session that opened it').toBe(true)
    }, 40_000)

    it('closes when the case underneath it is deleted', async () => {
      const made = await fetch(`${harness.base}/api/cases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({ title: 'Ends with its case' }),
      })
      expect(made.ok).toBe(true)
      const { id } = (await made.json()) as { id: string }

      const socket = new WebSocket(liveUrl(id), { headers: { cookie: admin.cookie, origin } })
      open.push(socket)
      await new Promise<void>((resolve, reject) => {
        socket.on('open', () => {
          resolve()
        })
        socket.on('error', reject)
      })

      const deleted = await fetch(`${harness.base}/api/cases/${id}`, {
        method: 'DELETE',
        headers: { cookie: admin.cookie },
      })
      expect(deleted.ok).toBe(true)

      const closed = await waitFor(() => socket.readyState === socket.CLOSED, 8000)
      expect(closed, 'the socket outlived the case it was open on').toBe(true)
    }, 40_000)
  })
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
