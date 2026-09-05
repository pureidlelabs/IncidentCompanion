/**
 * That the body conversion is *wired*, not merely correct.
 *
 * **The conversion being right is the easy half.** `naming.test.ts` covers it.
 * This covers the half that actually failed: a middleware registered against a
 * route pattern that matches nothing is indistinguishable from no middleware at
 * all - the server starts, every request succeeds, and every body arrives
 * unconverted.
 */
import { pathToRegexp } from 'path-to-regexp'
import { describe, expect, it, vi } from 'vitest'

import { ALL_ROUTES, CamelCaseBodyMiddleware } from './camel-case.middleware.js'

describe('the route pattern the middleware is mounted on', () => {
  /**
   * Every shape a case write takes. Express 5 is what parses this, so the
   * assertion runs its parser rather than a regex written here.
   */
  it.each([
    '/api/cases',
    '/api/cases/abc/timeline',
    '/api/cases/abc/network_indicators/def',
    '/api/specs',
  ])('covers %s', (path) => {
    expect(pathToRegexp(ALL_ROUTES).regexp.test(path)).toBe(true)
  })

  /**
   * **The spelling that was there first, kept as the assertion.** `'*'` was
   * correct in Express 4 and in every Nest example predating v11; under
   * path-to-regexp v8 it raises rather than matching, so nothing about it reads
   * as broken until a body arrives unconverted.
   */
  it('is not the Express 4 wildcard, which does not parse at all', () => {
    expect(() => pathToRegexp('*')).toThrow(/Missing parameter name/)
  })
})

describe('the middleware itself', () => {
  /**
   * Built the way Express delivers a mounted router's request, which is the
   * whole point: the matched prefix is in `baseUrl` and not in `path`. A
   * fixture setting `path` alone passes both skip tests while neither skip
   * works.
   */
  const run = (path: string, body: unknown) => {
    const req = {
      // What Express hands a mounted router: the prefix is in `baseUrl`.
      path: '/',
      baseUrl: path,
      originalUrl: path,
      body,
    } as Parameters<CamelCaseBodyMiddleware['use']>[0]
    const next = vi.fn()
    new CamelCaseBodyMiddleware().use(req, {} as never, next)
    return { body: req.body as unknown, next }
  }

  it('camelises a body on the way in', () => {
    const { body, next } = run('/api/cases/abc/timeline', {
      event_source: 'analyst observation',
      description: 'x',
    })
    expect(body).toEqual({ eventSource: 'analyst observation', description: 'x' })
    expect(next).toHaveBeenCalledOnce()
  })

  /**
   * **Better Auth owns its own request shapes.** `callbackURL` survives this
   * conversion untouched today; relying on that is a bet on a third party's
   * field naming, and the cost of not betting is one `startsWith`.
   */
  it('leaves an auth body alone', () => {
    const { body } = run('/api/auth/sign-in/email', { call_back: 1 })
    expect(body).toEqual({ call_back: 1 })
  })

  /**
   * A language pack's keys are data, not field names: converted, they become
   * keys this app never prints and are dropped as unknown.
   */
  it('leaves the keys of an uploaded language pack alone', () => {
    const { body } = run('/api/report/languages', {
      code: 'de',
      label: 'Deutsch',
      strings: { 'value.not_recorded': 'Nicht erfasst', 'column.first_seen': 'Zuerst gesehen' },
    })
    expect(body).toEqual({
      code: 'de',
      label: 'Deutsch',
      strings: { 'value.not_recorded': 'Nicht erfasst', 'column.first_seen': 'Zuerst gesehen' },
    })
  })

  it.each([
    ['no body', undefined],
    ['a null body', null],
  ])('passes %s through without throwing', (_name, value) => {
    expect(() => run('/api/cases', value)).not.toThrow()
  })
})
