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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, sharedAnalyst, type Harness, type Persona } from './app-harness.js'

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
   * The other half: a legitimate delete still works. A fix that refused every
   * capitalisation by refusing everything would pass the cases above.
   */
  it('still lets the level be reached for a caller who holds it', async () => {
    const id = await aCase('Deleted by somebody who may')
    const refused = await deleting(`/api/cases/${id}`, analyst)
    expect(refused.status).toBe(403)
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
})
