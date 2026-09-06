/**
 * Which origins may drive this server, and that the list is no longer.
 *
 * The origin check is CSRF defence, so each case here is a claim about who may
 * act as the analyst. What is **not** covered: whether Better Auth consults the
 * list at all - these call `trustedOrigins` directly, and only a request
 * against a running server shows the check firing.
 */
import { describe, expect, it } from 'vitest'

import { loadEnv } from '../config/env.js'
import { trustedOrigins } from './trusted-origins.js'

const BASE = 'https://127.0.0.1:8124'

describe('the origins allowed to drive this server', () => {
  it('accepts the base URL and its other loopback spelling', () => {
    const allowed = trustedOrigins(BASE, 'production')
    expect(allowed).toContain('https://127.0.0.1:8124')
    expect(allowed).toContain('https://localhost:8124')
  })

  it('accepts the IPv6 loopback', () => {
    expect(trustedOrigins(BASE, 'production')).toContain('https://[::1]:8124')
  })

  /**
   * **The port is carried, never widened.** `https://localhost:9999` is a
   * different server that happens to be on the same machine; trusting it would
   * let anything an analyst runs locally drive this one.
   */
  it('does not accept another port', () => {
    const allowed = trustedOrigins(BASE, 'production')
    expect(allowed).not.toContain('https://localhost:9999')
    expect(allowed.every((origin) => origin.endsWith(':8124'))).toBe(true)
  })

  /**
   * **The scheme is carried too.** There is no plaintext port on this server,
   * so an `http://` origin is not the same server written differently - it is
   * a request that could not have come from it.
   */
  it('does not accept the plaintext spelling of itself', () => {
    expect(trustedOrigins(BASE, 'production')).not.toContain('http://127.0.0.1:8124')
  })

  it('accepts nothing that is not loopback', () => {
    const allowed = trustedOrigins('https://incidents.example:443', 'production')
    expect(allowed).toEqual(['https://incidents.example'])
  })

  /**
   * **The Vite origin is development-only, and that is the whole reason this
   * takes an environment.** In development the browser loads the app from
   * Vite's port and calls the API through its proxy, so that origin has to be
   * trusted for sign-in to work at all. It is a *different port*, which is a
   * genuinely wider grant - anything else listening there could drive the
   * app - so it must not survive into a production build.
   */
  it('trusts the dev server\u2019s port in development and not in production', () => {
    // **The port comes from the environment, not a literal.** A literal is the
    // main checkout's, so on a worktree whose Vite is elsewhere it admits an
    // origin the stack does not use. `dev-node.sh` exports `IC_VITE_PORT` from
    // the same derivation everything else reads.
    const before = process.env['IC_VITE_PORT']
    process.env['IC_VITE_PORT'] = '5373'
    try {
      expect(trustedOrigins(BASE, 'development')).toContain('https://localhost:5373')
      expect(trustedOrigins(BASE, 'production')).not.toContain('https://localhost:5373')
    } finally {
      if (before === undefined) delete process.env['IC_VITE_PORT']
      else process.env['IC_VITE_PORT'] = before
    }
  })

  it('adds no development origin when the Vite port is not named', () => {
    const before = process.env['IC_VITE_PORT']
    delete process.env['IC_VITE_PORT']
    try {
      const origins = trustedOrigins(BASE, 'development')
      expect(origins.filter((origin) => !origin.endsWith(':8124'))).toEqual([])
    } finally {
      if (before !== undefined) process.env['IC_VITE_PORT'] = before
    }
  })

  it('answers an empty list rather than guessing', () => {
    expect(trustedOrigins('not a url', 'production')).toEqual([])
  })

  /**
   * **The mode the server actually runs in, not the one this file types.**
   * Every assertion above passes `'production'` as a literal, so none of them
   * asks which branch the app boots into; this one resolves `NODE_ENV` the way
   * the app does.
   */
  it('does not trust the dev server on the default this app boots with', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
      SEED_DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
      REDIS_URL: 'redis://127.0.0.1:6379',
      AUTH_SECRET: 'x'.repeat(32),
      AUTH_BASE_URL: BASE,
    })

    const allowed = trustedOrigins(BASE, env.NODE_ENV)
    expect(allowed).not.toContain('https://127.0.0.1:5173')
    expect(allowed).not.toContain('https://localhost:5173')
  })
})
