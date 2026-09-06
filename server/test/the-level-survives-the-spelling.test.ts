/**
 * **The level an act needs is derived from the path, so the path is an input
 * an attacker controls.**
 *
 * `levelNeeded` finds the case by matching the segment `cases`, and Express
 * routes case-insensitively unless `case sensitive routing` is enabled --
 * which this app does not enable. So `/api/Cases/{id}` reaches the same
 * handler while the derivation looks at `Cases`, finds no `cases`, and answers
 * with the level for something *inside* a case.
 *
 * **Driven over HTTP rather than against the exported function, and that is
 * the point of the file.** `a-level-is-asked-before-a-write.test.ts` calls
 * `levelNeeded` with hand-written strings, so it can only contain paths its
 * author thought of -- it cannot discover one Express routes and the author
 * did not anticipate. A request is the only thing that asks both questions at
 * once: what does the framework route this to, and what does the guard think
 * it is.
 *
 * The analyst here holds the default customer's floor, which is read and
 * write. That is deliberately the interesting level: they may edit everything
 * inside the case and may not delete the case, so any spelling that turns
 * `delete` into `write` hands them exactly the act the model withholds.
 */
import { connect } from 'node:net'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  grantsItselfDelete,
  sharedAdmin,
  sharedAnalyst,
  type Harness,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('the level an act needs survives its spelling', () => {
  let harness: Harness
  let admin: Persona
  let analyst: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /** A case nobody has attributed, so the analyst reaches it at the floor. */
  async function aCase(title: string): Promise<string> {
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title }),
    })
    if (!made.ok) throw new Error(`could not open a case: ${String(made.status)}`)
    return ((await made.json()) as { id: string }).id
  }

  const deleting = (path: string, who: Persona) =>
    fetch(`${harness.base}${path}`, { method: 'DELETE', headers: { cookie: who.cookie } })

  /**
   * One request with the target written exactly as given, on a raw socket.
   *
   * **`fetch` cannot express these.** WHATWG URL normalisation strips a
   * fragment and resolves dot segments before anything reaches the wire, and
   * `fetch` has no way to send an absolute-form target at all -- so a harness
   * built on it is structurally unable to reach the two shapes below, however
   * many spellings it tries. Measured: `fetch('...#/x/y')` puts
   * `/api/cases/{id}` on the socket.
   *
   * Resolves to the status line's code.
   */
  function rawDelete(target: string, who: Persona): Promise<number> {
    const url = new URL(harness.base)
    return new Promise((resolve, reject) => {
      const socket = connect(Number(url.port), url.hostname, () => {
        socket.write(
          `DELETE ${target} HTTP/1.1\r\nHost: ${url.host}\r\n` +
            `Cookie: ${who.cookie}\r\nConnection: close\r\n\r\n`,
        )
      })
      let answer = ''
      socket.setTimeout(10_000, () => {
        socket.destroy()
        reject(new Error(`no answer to ${target}`))
      })
      socket.on('data', (chunk: Buffer) => {
        answer += chunk.toString('utf8')
      })
      socket.on('error', reject)
      socket.on('close', () => {
        const status = /^HTTP\/1\.[01] (\d{3})/.exec(answer)
        resolve(status ? Number(status[1]) : 0)
      })
    })
  }

  it('refuses the analyst the case itself, spelled as the route declares it', async () => {
    const id = await aCase('Spelled as declared')
    const refused = await deleting(`/api/cases/${id}`, analyst)
    expect(refused.status).toBe(403)
  }, 30_000)

  /**
   * **The escalation.** Express routes this to the same handler; the
   * derivation reads `Cases`, matches nothing, and falls through to `write`,
   * which the analyst holds.
   */
  it.each(['Cases', 'CASES', 'cAsEs'])(
    'refuses it spelled /api/%s/{id} as well',
    async (spelling) => {
      const id = await aCase(`Spelled ${spelling}`)
      const refused = await deleting(`/api/${spelling}/${id}`, analyst)

      // Either answer is correct and they are different fixes: 403 means the
      // guard asked the right question, 404 means Express never routed it.
      // What must not happen is the case being gone.
      expect([403, 404]).toContain(refused.status)

      const still = await fetch(`${harness.base}/api/cases/${id}`, {
        headers: { cookie: admin.cookie },
      })
      expect(still.status, `the case was deleted through /api/${spelling}/`).toBe(200)
    },
    30_000,
  )

  /**
   * **The other half, and the easy one to leave out.** Deleting as the analyst
   * and expecting 403 is behaviour-identical to the case above, so the hazard
   * named there -- a fix that refuses everybody -- passes it. Without a
   * successful delete somewhere in the file, nothing can tell a correct guard
   * from a shut one.
   *
   * The administrator takes the path the requirement names: a group holding
   * the default customer, joined at delete.
   */
  it('still deletes for a caller who does hold the level', async () => {
    await grantsItselfDelete(harness, admin)
    const id = await aCase('Deleted by somebody who may')
    const done = await deleting(`/api/cases/${id}`, admin)
    expect(done.ok, `an administrator holding delete was refused ${String(done.status)}`).toBe(true)

    const gone = await fetch(`${harness.base}/api/cases/${id}`, {
      headers: { cookie: admin.cookie },
    })
    expect(gone.status).toBe(404)
  }, 40_000)

  /**
   * **The casing was one shape of the real defect, and these are the others.**
   *
   * A guard reading `originalUrl` -- the raw request target, as the client
   * wrote it -- re-parses bytes Express has already parsed. Two parsers, one
   * string, and every disagreement between them is an escalation:
   *
   * - a fragment: Express strips `#/x` before matching, so `caseId` is a clean
   *   uuid and the handler runs, while the raw target splits into four
   *   segments and the derivation calls it a write. nginx forwards the
   *   fragment byte-for-byte, so this is not a curiosity of the harness.
   * - an absolute-form target, which RFC 7230 requires a server to accept:
   *   `indexOf('cases')` finds the *authority* rather than the path segment.
   *
   * Not re-parsing is what avoids both: `request.path` is the value Express
   * itself derived, and it carries neither.
   */
  it.each([
    ['a fragment', (id: string) => `/api/cases/${id}#/x`],
    ['a longer fragment', (id: string) => `/api/cases/${id}#/x/y`],
    ['an absolute-form target', (id: string) => `http://cases/api/cases/${id}`],
    ['an absolute-form target, capitalised', (id: string) => `HTTP://CASES/api/cases/${id}`],
  ])('refuses the analyst a delete written with %s', async (_name, target) => {
    const id = await aCase(`Raw target: ${_name}`)
    const status = await rawDelete(target(id), analyst)
    expect([400, 403, 404]).toContain(status)

    const still = await fetch(`${harness.base}/api/cases/${id}`, {
      headers: { cookie: admin.cookie },
    })
    expect(still.status, `the case was deleted through ${target(id)}`).toBe(200)
  }, 30_000)

  /**
   * **The same bug in the other place a request path is read by hand.**
   * `noStoreOnTheApi` asks `startsWith('/api/')`, so a capitalised path is
   * served by the API and answered without `Cache-Control: no-store` -- case
   * data landing in whatever shared cache is between the analyst and the app.
   *
   * Quantified over the spellings rather than over the routes: one route is
   * enough to show the middleware's own test, and the middleware is what is
   * wrong.
   */
  it.each(['/API/cases', '/Api/cases', '/api/cases'])(
    'answers %s with no-store, whatever the casing',
    async (path) => {
      const answered = await fetch(`${harness.base}${path}`, {
        headers: { cookie: admin.cookie },
      })
      expect(answered.status).toBe(200)
      expect(answered.headers.get('cache-control')).toContain('no-store')
    },
    30_000,
  )

  /**
   * **The third site, and the last one where the wrong answer is permissive.**
   * `NEVER_THE_SHELL` is a denylist, so a spelling that misses it is answered
   * with the single-page shell and a 200 -- an unknown `/API/` address looking
   * to a client like a route that exists.
   *
   * The allowlist in `must-change-password.interceptor.ts` is the same shape
   * inverted and is deliberately left alone: missing an entry there refuses,
   * which is the direction that costs nothing.
   */
  it.each(['/API/nothing-here', '/Api/nothing-here', '/api/nothing-here'])(
    'does not answer %s with the application shell',
    async (path) => {
      const answered = await fetch(`${harness.base}${path}`, {
        headers: { cookie: admin.cookie },
      })
      expect(answered.status).toBe(404)
    },
    30_000,
  )
})
