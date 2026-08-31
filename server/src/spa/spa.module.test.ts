/**
 * The exclusion patterns, which are the whole risk in serving a SPA - the
 * failure they guard is a `/api` request answered with `index.html` and a 200,
 * whose symptom is a client-side JSON error naming `<!doctype`.
 *
 * These assert the patterns themselves and not a live request, which needs a
 * built bundle on disk.
 */
import { describe, expect, it } from 'vitest'

import { bundlePath } from './spa.module.js'

/**
 * Express 5's matcher, as `path-to-regexp` v8 reads it. Only the two forms
 * this module uses are modelled - enough to tell a wildcard that matches from
 * one that silently does not.
 */
function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/{*path}')) {
    const prefix = pattern.slice(0, -'/{*path}'.length)
    return path.startsWith(`${prefix}/`)
  }
  if (pattern.endsWith('*')) {
    // Express 4 read this as a wildcard. Express 5 does not: a bare `*` is a
    // parameter name it never fills, so the route matches nothing at all.
    return false
  }
  return pattern === path
}

const NOT_THE_SPA = ['/api', '/api/{*path}']
const excluded = (path: string): boolean => NOT_THE_SPA.some((one) => matches(one, path))

describe('what the SPA must not answer', () => {
  it('leaves a route that exists to the API', () => {
    expect(excluded('/api/cases')).toBe(true)
    expect(excluded('/api/cases/abc/timeline')).toBe(true)
    expect(excluded('/api/auth/sign-in/email')).toBe(true)
  })

  it('leaves a route that does NOT exist to the API', () => {
    // The one that matters. A mistyped path has to reach Nest and answer a
    // JSON 404; served the HTML shell instead, the client's own error names a
    // document rather than the request.
    expect(excluded('/api/nonsense')).toBe(true)
    expect(excluded('/api/cases/not-a-uuid')).toBe(true)
  })

  it('leaves the bare /api to the API', () => {
    // `/api/{*path}` wants a segment after the slash, so without listing it
    // separately the bare path falls through to the SPA.
    expect(excluded('/api')).toBe(true)
  })

  it('claims everything else, so client-side routing survives a reload', () => {
    // Typing a deep link into the browser has to load the app, not 404.
    expect(excluded('/')).toBe(false)
    expect(excluded('/cases')).toBe(false)
    expect(excluded('/cases/abc/timeline')).toBe(false)
    expect(excluded('/assets/index-abc123.js')).toBe(false)
  })

  it('does not exclude a path that merely starts with the word', () => {
    // `/apiary` is not the API. A prefix match on the bare string would take
    // it, and the app would 404 on a route it owns.
    expect(excluded('/apiary')).toBe(false)
  })

  /**
   * **The reference viewer used to be the second example above, and the move
   * inverted it.** At `/api-docs` it began with `/api` without being under it,
   * so the SPA had to *not* exclude it and its vendored assets had to be named
   * separately. At `/api/docs` it is genuinely under the API, the special case
   * is gone, and `DocsController` owns the page by being registered before the
   * catch-all rather than by a spelling.
   */
  it('excludes the reference viewer and its assets, now that both are under /api', () => {
    expect(excluded('/api/docs')).toBe(true)
    expect(excluded('/api/docs/assets/redoc.standalone.js')).toBe(true)
  })

  it('would have matched nothing under the Express 4 spelling', () => {
    // The trap, asserted rather than described: this is what `/api*` does on
    // Express 5 - no error, no match, and every API call served the shell.
    expect(matches('/api*', '/api/cases')).toBe(false)
    expect(matches('/api/{*path}', '/api/cases')).toBe(true)
  })
})

describe('where the bundle is looked for', () => {
  it('takes UI_DIR when the deployment names one', () => {
    const at = bundlePath({ get: () => '/srv/incidentcompanion/ui' } as never)
    expect(at).toBe('/srv/incidentcompanion/ui')
  })

  it('falls back to a path derived from this file, not the working directory', () => {
    // `cwd` is whatever the launcher was started from; the module's own
    // location is not.
    const at = bundlePath({ get: () => undefined } as never)
    expect(at.endsWith('/ui/dist')).toBe(true)
    expect(at.startsWith('/')).toBe(true)
  })
})
