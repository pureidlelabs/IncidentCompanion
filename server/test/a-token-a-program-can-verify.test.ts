/**
 * The two routes the jwt plugin mounts, and what each one answers to a caller
 * with no session.
 *
 * **Neither is swept by `anonymous-access.test.ts`**, and that is not an
 * oversight there: that sweep enumerates the published route table, and Better
 * Auth mounts its own paths under `/api/auth/*` without appearing in it. So
 * the routes a plugin adds are guarded by nobody's sweep, and this is the file
 * that looks at them.
 *
 * The two answers are deliberately different, and the difference is the whole
 * design: **the public half is public because a verifier holds no credential**,
 * and the mint is a session operation because a token speaks for whoever asked
 * for it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

interface Jwks {
  keys: { kty?: string; alg?: string; crv?: string; x?: string; d?: string; kid?: string }[]
}

describe.skipIf(!runnable)('a token a program can verify', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  it('publishes the verifying keys to a caller with no session', async () => {
    const answer = await fetch(`${harness.base}/api/auth/jwks`)

    expect(answer.status, 'a verifier holds no credential and must still read this').toBe(200)
    const body = (await answer.json()) as Jwks
    expect(Array.isArray(body.keys)).toBe(true)
  })

  /**
   * **The half that would be a disclosure.** A JWKS document carries public
   * keys; `d` is the private exponent, and a set that published it would let
   * anyone who fetched it mint tokens this install would vouch for.
   *
   * Asserted over every key rather than the first, because rotation puts more
   * than one in the set and the newest is not always first.
   */
  it('publishes no private half', async () => {
    const answer = await fetch(`${harness.base}/api/auth/jwks`)
    const body = (await answer.json()) as Jwks

    for (const key of body.keys) {
      expect(key, 'the private half of a signing key reached the open endpoint').not.toHaveProperty(
        'd',
      )
      expect(key).not.toHaveProperty('privateKey')
    }
  })

  it('refuses to mint a token for a caller with no session', async () => {
    const answer = await fetch(`${harness.base}/api/auth/token`)

    expect(answer.status, 'anybody could mint a token for this install').not.toBe(200)
    expect(await answer.text()).not.toMatch(/eyJ/)
  })

  it('mints one for a caller who is signed in', async () => {
    const answer = await fetch(`${harness.base}/api/auth/token`, {
      headers: { cookie: admin.cookie },
    })

    expect(answer.status).toBe(200)
    const { token } = (await answer.json()) as { token: string }
    expect(token.split('.')).toHaveLength(3)
  })

  /**
   * **The payload is named in `auth.config.ts` rather than inherited**, and
   * this is what holds that decision: the plugin's default is the whole user
   * object, so a token minted to say who is calling would carry that person's
   * address and ban state to every service it was shown to.
   */
  it('carries who is calling and nothing else about them', async () => {
    const answer = await fetch(`${harness.base}/api/auth/token`, {
      headers: { cookie: admin.cookie },
    })
    const { token } = (await answer.json()) as { token: string }
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>

    // The harness's persona carries its cookie, role and address, never its
    // id -- so the claim is checked for being an identifier rather than
    // against one the fixture already knew.
    expect(typeof claims['id']).toBe('string')
    expect(String(claims['id']).length).toBeGreaterThan(0)
    expect(claims['role']).toBe(admin.role)

    for (const leaked of ['email', 'name', 'banned', 'banReason', 'image']) {
      expect(claims, `the token carries the caller's ${leaked}`).not.toHaveProperty(leaked)
    }
  })

  /**
   * A bearer token cannot be withdrawn once it has left, so its lifetime is
   * the only bound on a leaked one. Asserted as a ceiling rather than an
   * equality: raising it is the change worth noticing.
   */
  it('expires within the hour', async () => {
    const answer = await fetch(`${harness.base}/api/auth/token`, {
      headers: { cookie: admin.cookie },
    })
    const { token } = (await answer.json()) as { token: string }
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
    ) as { exp: number; iat: number }

    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60 * 60)
  })
})
