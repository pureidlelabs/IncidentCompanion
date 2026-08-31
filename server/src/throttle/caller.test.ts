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
import { describe, expect, it } from 'vitest'

import { callerAddress } from './caller.js'

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
  /**
   * **No proxy, so the socket is the caller** - and the header must not be
   * read, or anyone can choose their own bucket by sending one.
   */
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
