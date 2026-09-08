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

  /**
   * The same request, with a target the skip list did not read.
   *
   * `originalUrl` is the caller's own string rather than anything the framework
   * derived, so a skip written as `startsWith` reads whatever was sent. Both
   * shapes below were measured against a real Express server: each is routed
   * `200`, and neither `startsWith('/api/report/languages')`. -> #125
   */
  const runTarget = (originalUrl: string, body: unknown) => {
    const req = {
      path: '/',
      baseUrl: '',
      originalUrl,
      body,
    } as Parameters<CamelCaseBodyMiddleware['use']>[0]
    new CamelCaseBodyMiddleware().use(req, {} as never, vi.fn())
    return req.body as unknown
  }

  const PACK = {
    code: 'de',
    label: 'Deutsch',
    strings: { 'value.not_recorded': 'Nicht erfasst' },
  }

  /**
   * RFC 7230 absolute-form. No HTTP client sends one to an origin server, which
   * is why measuring it meant writing the request line onto a socket -- and the
   * server routes it exactly as it routes the origin-form.
   */
  it('leaves a language pack alone when the target is absolute-form', () => {
    expect(runTarget('http://x/api/report/languages', structuredClone(PACK))).toEqual(PACK)
  })

  /**
   * Routing is case-insensitive unless an install asks otherwise, and this one
   * sets no `caseSensitive`, so `/API/...` reaches the same handler.
   */
  it('leaves a language pack alone when the path is capitalised', () => {
    expect(runTarget('/API/report/languages', structuredClone(PACK))).toEqual(PACK)
  })

  /** The same two shapes on the auth prefix, skipped for its own reason. */
  it.each(['http://x/api/auth/sign-in/email', '/API/auth/sign-in/email'])(
    'leaves an auth body alone at %s',
    (target) => {
      expect(runTarget(target, { call_back: 1 })).toEqual({ call_back: 1 })
    },
  )

  /**
   * The other direction, so the fix cannot be "skip everything": a target that
   * only resembles a skipped prefix is converted as before.
   */
  it.each([
    '/api/report/languages-of-record',
    'http://x/api/cases/abc/timeline',
    '/api/authors',
  ])('still converts %s', (target) => {
    expect(runTarget(target, { event_source: 'x' })).toEqual({ eventSource: 'x' })
  })

  it.each([
    ['no body', undefined],
    ['a null body', null],
  ])('passes %s through without throwing', (_name, value) => {
    expect(() => run('/api/cases', value)).not.toThrow()
  })
})
