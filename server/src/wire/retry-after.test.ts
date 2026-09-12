/**
 * Covers the rule, not the limiters: these drive a response object directly.
 *
 * That the throttler's own refusal comes out with the standard name is asserted
 * end to end in `test/a-caller-that-asks-too-often-is-told-when-to-return.test.ts`.
 * The credential door has no case of its own anywhere -- Better Auth builds
 * that response inside the library -- so `x-retry-after` here stands for it by
 * its spelling rather than by reaching it.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'

import { retryAfterOnEveryRefusal } from './retry-after.js'

/**
 * A response that records what was set and can be flushed.
 *
 * Header names are lower-cased on the way in, as Node's own store does -- the
 * middleware reads `getHeaders()`, whose keys are lower case whatever spelling
 * was written.
 */
function respondWith(status: number, headers: Record<string, string | number>) {
  const held = new Map<string, string | number>()
  for (const [name, value] of Object.entries(headers)) held.set(name.toLowerCase(), value)

  const response = {
    statusCode: status,
    getHeaders: () => Object.fromEntries(held),
    getHeader: (name: string) => held.get(name.toLowerCase()),
    setHeader: (name: string, value: string | number) => held.set(name.toLowerCase(), value),
    writeHead: vi.fn(function (this: unknown) {
      return this
    }),
  } as unknown as Response

  retryAfterOnEveryRefusal()({} as Request, response, () => undefined)
  response.writeHead(status)
  return held
}

describe('a refusal names the wait under the registered field', () => {
  it('repeats the throttler tier header under the standard name', () => {
    const sent = respondWith(429, { 'Retry-After-burst': 7 })

    expect(sent.get('retry-after')).toBe('7')
    expect(sent.get('retry-after-burst'), 'the tier that refused is still named').toBe(7)
  })

  it('repeats the credential limiter header, which is spelled differently again', () => {
    const sent = respondWith(429, { 'X-Retry-After': 60 })

    expect(sent.get('retry-after')).toBe('60')
  })

  it('leaves a wait the answer already stated under that name alone', () => {
    const sent = respondWith(429, { 'Retry-After': 3, 'Retry-After-api': 9 })

    expect(sent.get('retry-after'), 'never overwritten with the other spelling').toBe(3)
  })

  it('adds nothing to an answer that refused for some other reason', () => {
    const sent = respondWith(200, { 'X-Retry-After': 60 })

    expect(sent.has('retry-after')).toBe(false)
  })

  it('adds nothing when no other name carries a wait', () => {
    const sent = respondWith(429, { 'Content-Type': 'application/json' })

    expect(sent.has('retry-after')).toBe(false)
  })
})
