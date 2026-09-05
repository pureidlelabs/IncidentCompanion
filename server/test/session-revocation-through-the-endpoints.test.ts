/**
 * Signing every other device out, driven through the endpoints an analyst uses.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Redis } from 'ioredis'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('signing other devices out', () => {
  let harness: Harness
  let redis: Redis
  let email: string

  /** What the account's password becomes once the hold is cleared. */
  const PASSWORD = 'harness-password-1234'

  /** One account, two sign-ins: the analyst's own screen and the other device. */
  let here: Persona
  let elsewhere: Persona

  const whoAmI = async (persona: Persona): Promise<number> => {
    const response = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: persona.cookie },
    })
    // A signed-out caller is answered `null` on a 200, so the status alone
    // would read as still-authenticated.
    return (await response.json()) ? response.status : 401
  }

  const listSessions = async (persona: Persona): Promise<number> => {
    const response = await fetch(`${harness.base}/api/auth/list-sessions`, {
      headers: { cookie: persona.cookie },
    })
    const body = (await response.json()) as unknown[]
    return Array.isArray(body) ? body.length : 0
  }

  /**
   * **An account of this file's own, created the way an install creates one.**
   */
  const ISSUED = 'issued-password-1234'

  beforeAll(async () => {
    harness = await boot()
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379')
    email = `revocation-${process.pid}@harness.test`

    const admin = await sharedAdmin(harness)
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Revocation harness',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    if (!created.ok) {
      throw new Error(`creating this file's analyst answered ${created.status}: ${await created.text()}`)
    }

    const held = await signIn(harness, email, ISSUED)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: PASSWORD, repeat: PASSWORD }),
    })
    if (!changed.ok) {
      throw new Error(`the analyst could not set its own password: ${changed.status}`)
    }

    here = await signIn(harness, email, PASSWORD)
    elsewhere = await signIn(harness, email, PASSWORD)
  }, 90_000)

  afterAll(async () => {
    await redis.quit()
    await harness.close()
  })

  it('signs the other device out when the index is in Redis', async () => {
    // The ordinary path, so a failure here is not about the index at all.
    expect(await whoAmI(elsewhere)).toBe(200)

    const revoked = await fetch(`${harness.base}/api/auth/revoke-other-sessions`, {
      method: 'POST',
      headers: { cookie: here.cookie },
    })
    expect(revoked.status).toBe(200)

    expect(await whoAmI(elsewhere), 'the other device is still signed in').toBe(401)
    expect(await whoAmI(here), 'the caller signed itself out too').toBe(200)
  })

  it('signs the other device out when Redis has lost the index', async () => {
    /**
     * **The defect this file exists for.**
     */
    const other = await signIn(harness, email, PASSWORD)
    expect(await whoAmI(other)).toBe(200)

    const indexes = await redis.keys('auth:active-sessions-*')
    expect(
      indexes.length,
      'no active-sessions index exists, so this test is deleting nothing and ' +
        'proves nothing -- the key name moved',
    ).toBeGreaterThan(0)
    await redis.del(...indexes)

    const revoked = await fetch(`${harness.base}/api/auth/revoke-other-sessions`, {
      method: 'POST',
      headers: { cookie: here.cookie },
    })
    expect(revoked.status).toBe(200)

    expect(
      await whoAmI(other),
      'revoke-other-sessions answered 200 and left the other device signed in: ' +
        'the index was missing, so the library was told this user has no other ' +
        'sessions and deleted no Redis copy',
    ).toBe(401)
  })

  it('reports the sessions that exist when Redis has lost the index', async () => {
    /**
     * The same hole, read rather than written.
     */
    const extra = await signIn(harness, email, PASSWORD)
    expect(await whoAmI(extra)).toBe(200)

    const indexes = await redis.keys('auth:active-sessions-*')
    if (indexes.length > 0) await redis.del(...indexes)

    expect(
      await listSessions(here),
      'the session list is empty while at least two sessions are usable, so an ' +
        'analyst is told there is nothing to sign out',
    ).toBeGreaterThan(1)
  })

  it('does NOT sign the other device out after Redis loses everything', async () => {
    /**
     * **A known gap, asserted as it behaves today so that closing it turns
     * this red.** The name says `does NOT` because that is what is pinned.
     */
    const other = await signIn(harness, email, PASSWORD)
    expect(await whoAmI(other)).toBe(200)

    // What `docker compose restart redis` does: the service declares no volume.
    const everything = await redis.keys('auth:*')
    if (everything.length > 0) await redis.del(...everything)

    const revoked = await fetch(`${harness.base}/api/auth/revoke-other-sessions`, {
      method: 'POST',
      headers: { cookie: here.cookie },
    })
    // It reports success. That is the defect, not an aside.
    expect(revoked.status).toBe(200)

    expect(
      await whoAmI(other),
      'the other device was signed out after a full keyspace loss -- the gap is ' +
        'closed, so delete this test and close the roadmap entry',
    ).toBe(200)
  })
})
