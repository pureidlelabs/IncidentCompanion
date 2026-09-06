/**
 * **Every route refuses a caller who is not signed in.**
 *
 * Quantified over the route table rather than written per route, because the
 * defect this catches is a route that *forgets* - and a per-route test is
 * written by the same person, at the same moment, as the route that forgot.
 * A new route is swept the day it is added, and a new public one has to be
 * argued for in `PUBLIC` below.
 *
 * **Safe to run against every method, including the writes.** Nest runs guards
 * before pipes and before the handler, so a refused request never reaches
 * anything that could mutate a row. The ids are also deliberately ones no
 * fixture creates.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, operations, type Harness, type Operation } from './app-harness.js'

const runnable = await bootable()

/**
 * The routes that answer an anonymous caller on purpose, each with the reason.
 *
 * **An allow-list rather than a metadata read, and that is deliberate.** Making
 * a route public is a security decision, so it should cost a line here and be
 * visible in a diff - reading `@Public()` off the handler would make the test
 * agree with whatever the code says, which is not a test.
 */
const PUBLIC: ReadonlyArray<readonly [string, string, string]> = [
  ['GET', '/api/health', 'The liveness probe. A monitor has no session.'],
  [
    'GET',
    '/api/openapi.json',
    'Route shapes only, and guarding it broke the docs page with a network error. ' +
      'The reversal is argued in openapi.controller.ts; /api/health/resources stays ' +
      'guarded because it describes the machine rather than the API.',
  ],
  [
    'GET',
    '/api/setup',
    'Whether this install has any accounts. Nobody can hold a session on one ' +
      'that has none, so a guarded setup route only opens from inside the room ' +
      'it lets you into. It answers a boolean and nothing else. ' +
      'It answers a boolean and nothing else.',
  ],
  [
    'GET',
    '/api/about',
    'The sign-in screen carries the same About dialog the session menu does, so ' +
      'a guarded route answered 401 to the caller most likely to ask - somebody ' +
      'deciding whether to sign into this install at all. What it discloses is ' +
      'identical in every copy of this software: the version, the licence, the ' +
      'copyright and three project URLs, and nothing about the machine, the ' +
      'install or the cases. Its sibling /api/health/resources stays guarded for ' +
      'exactly that contrast. Argued in about.controller.ts.',
  ],
  [
    'POST',
    '/api/setup',
    'Claims an install that has no accounts, gated by the setup token printed ' +
      'to the console rather than by a session \u2014 there cannot be one yet. It ' +
      'refuses outright once any account exists, so on every install this ' +
      'suite runs against it is already closed.',
  ],
]

const allowed = (one: Operation): string | undefined =>
  PUBLIC.find(([method, path]) => method === one.method && path === one.template)?.[2]

describe.skipIf(!runnable)('a caller who is not signed in', () => {
  let harness: Harness
  let all: Operation[]

  beforeAll(async () => {
    harness = await boot()
    all = operations(harness.document)
  }, 60_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * Guards the sweep below: an empty route table would pass it silently, which
   * is the shape a broken harness takes rather than a failing one.
   */
  it('has a route table to sweep at all', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  it('is refused by every route that is not deliberately public', async () => {
    const served: string[] = []

    for (const one of all) {
      if (allowed(one)) continue
      const response = await fetch(`${harness.base}${one.path}`, {
        method: one.method,
        headers: { 'content-type': 'application/json' },
        // A body on the writes, so a refusal cannot be mistaken for a parse
        // failure that happened to answer 4xx.
        body: ['GET', 'DELETE'].includes(one.method) ? undefined : '{}',
      })
      if (response.status !== 401) {
        served.push(`${one.method} ${one.template} -> ${response.status}`)
      }
    }

    expect(served).toEqual([])
  }, 120_000)

  /**
   * **An exemption for a route that is already guarded is the dangerous kind.**
   * It excuses nothing today and silently excuses everything the day that route
   * loses its guard - the sweep would stay green through exactly the regression
   * it exists to catch. An entry added on a guess about which routes are public
   * is how one gets here.
   */
  it('exempts nothing that is in fact guarded', async () => {
    const needless: string[] = []
    for (const [method, path, reason] of PUBLIC) {
      const one = all.find((o) => o.method === method && o.template === path)
      if (!one) continue // the staleness test below owns this case
      const response = await fetch(`${harness.base}${one.path}`, { method })
      if (response.status === 401) needless.push(`${method} ${path} \u2014 exempted for: ${reason}`)
    }
    expect(needless).toEqual([])
  }, 60_000)

  /**
   * **The allow-list cannot rot.** An entry naming a route that no longer
   * exists excuses nothing, and reads as though it still covered something.
   */
  it('has no allow-list entry for a route that is gone', () => {
    const live = new Set(all.map((one) => `${one.method} ${one.template}`))
    const stale = PUBLIC.filter(([method, path]) => !live.has(`${method} ${path}`)).map(
      ([method, path]) => `${method} ${path}`,
    )
    expect(stale).toEqual([])
  })
})
