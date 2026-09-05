/**
 * **The level an act needs is derived from the path, so the path is an input
 * an attacker controls.**
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
   * **The escalation.**
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
   * **The other half, and the easy one to leave out.**
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
