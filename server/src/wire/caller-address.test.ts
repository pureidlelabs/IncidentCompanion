/**
 * Which address a rate limit counts against, attacked from both sides.
 *
 * **Two opposite failures, and each one is worse than having no limit.**
 *
 * - Reading the proxy's own address counts the whole install as one caller, so
 *   the busiest analyst refuses everybody else. That is a denial of service
 *   the limit itself creates.
 * - Reading a header the caller can set lets an attacker pick a fresh bucket
 *   per request, which is a limit with a `next bucket please` button.
 *
 * The header can only be trusted because `docker/nginx/ic-proxy.inc` sets
 * `X-Real-IP $remote_addr` as an overwrite. That is what these cases encode.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { addressMode, callerAddress, trustedAddressHeaders } from './caller-address.js'

const SOCKET = '10.0.0.7'

describe('the address a limit counts against, in production', () => {
  it('is what nginx put in x-real-ip', () => {
    expect(callerAddress({ 'x-real-ip': '203.0.113.9' }, SOCKET, 'production')).toBe('203.0.113.9')
  })

  /**
   * **Never the socket in production, even though it is right there.** Behind
   * nginx the socket is nginx, so falling back to it is the whole-install
   * bucket - and it would fall back on exactly the request that arrived
   * without the header.
   */
  it('is not the socket address, which behind nginx is the proxy', () => {
    expect(callerAddress({}, SOCKET, 'production')).toBeNull()
  })

  /**
   * **`x-forwarded-for` is not read.** nginx overwrites it too, so reading it
   * would work - and would make the app depend on a header that outside
   * production is whatever the caller says.
   */
  it('ignores x-forwarded-for', () => {
    expect(
      callerAddress({ 'x-forwarded-for': '198.51.100.1' }, SOCKET, 'production'),
      'a header the app does not trust decided the bucket',
    ).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
  ])('treats an %s header as no address rather than as a bucket', (_why, value) => {
    expect(callerAddress({ 'x-real-ip': value }, SOCKET, 'production')).toBeNull()
  })

  /** Node hands a repeated header through as an array. */
  it('takes the first when the header arrives more than once', () => {
    expect(callerAddress({ 'x-real-ip': ['203.0.113.9', '10.0.0.1'] }, SOCKET, 'production')).toBe(
      '203.0.113.9',
    )
  })
})

describe('the address a limit counts against, in the dev loop', () => {
  it('is the socket address', () => {
    expect(callerAddress({}, SOCKET, 'development')).toBe(SOCKET)
  })

  it('ignores x-real-ip, which nothing trustworthy set', () => {
    expect(
      callerAddress({ 'x-real-ip': '203.0.113.9' }, SOCKET, 'development'),
      'a caller picked its own bucket',
    ).toBe(SOCKET)
  })

  it('is null when there is no socket either', () => {
    expect(callerAddress({}, undefined, 'development')).toBeNull()
  })
})

/**
 * The mode this decision reads, asked for the value nobody set.
 *
 * **`env.ts` resolves an unset `NODE_ENV` to `production`**, because that is
 * the closed setting for the trusted-origin list. It is the open one here, so
 * this must not share it: an install that names no mode has no proxy this app
 * knows of.
 */
describe('when a header may be believed at all', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /**
   * **Deleted rather than stubbed empty, which is the only way to reach the
   * fallback.** `vi.stubEnv(name, '')` assigns the string, so `??` never
   * fires and the case passes without exercising it; `vi.stubEnv(name,
   * undefined)` deletes through a proxy with no `deleteProperty` trap and
   * leaves the value in place. `env.ts` refuses to start without the
   * variable, so this asserts the module's own floor rather than a reachable
   * deployment.
   */
  it('treats a mode nobody set as untrusted', () => {
    const had = process.env['NODE_ENV']
    try {
      delete process.env['NODE_ENV']
      expect(process.env['NODE_ENV'], 'the delete did not apply').toBeUndefined()
      expect(addressMode(), 'an unset mode resolved to the trusting answer').not.toBe('production')
      expect(trustedAddressHeaders()).toEqual([])
    } finally {
      if (had === undefined) delete process.env['NODE_ENV']
      else process.env['NODE_ENV'] = had
    }
  })

  it.each(['development', 'test', 'staging', '', 'Production', 'PRODUCTION'])(
    'trusts no header where the mode is %o',
    (mode) => {
      expect(trustedAddressHeaders(mode), 'a mode that is not production was trusted').toEqual([])
    },
  )

  it('names exactly one header where a proxy set it', () => {
    expect(trustedAddressHeaders('production')).toEqual(['x-real-ip'])
  })

  /**
   * **The whole point of the module, asserted as agreement rather than per
   * reader.** Better Auth takes a header list and the other two take a value,
   * so nothing else compares them -- and the defect this replaces was one
   * reader believing the header while another refused it, for the same
   * request.
   */
  it.each(['production', 'development', 'test', ''])(
    'answers the value and the list consistently, in mode %o',
    (mode) => {
      const believed = trustedAddressHeaders(mode).length > 0
      const answer = callerAddress({ 'x-real-ip': '203.0.113.9' }, '10.0.0.7', mode)

      expect(
        answer === '203.0.113.9',
        'the value read a header the list does not name, or refused one it does',
      ).toBe(believed)
    },
  )
})
