/**
 * **What every response tells the browser it may do.**
 *
 * The server had no policy at all, which matters more here than for a pure API
 * because this process also serves the application: a page was being handed
 * over with nothing said about what it may load, whether it may be framed, or
 * whether a response may be sniffed into something other than its declared
 * type.
 *
 * **Asserted over the wire and on a *page*, not only on `/api`.** The bundle is
 * served by Express middleware rather than by a controller, so a policy
 * registered through Nest alone would cover the API and miss the application.
 * That is the failure this file exists to catch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

/**
 * **`skipIf` here is a boot check, not a gap in the gate.** `bootable()` is
 * false only where no database can be reached; the landing command
 * `test_scope.py` prints boots one, so these run. Verified 2026-08-20 after a
 * review flagged the conditional: 13 passed, the Azure-origins assertion among
 * them. Recorded rather than changed, because a suite that cannot boot has
 * nothing to assert against and saying so beats failing.
 */
const runnable = await bootable()

describe.skipIf(!runnable)('every response', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const headersOf = async (path: string): Promise<Headers> =>
    (await fetch(`${harness.base}${path}`)).headers

  /**
   * **The same policy, not two policies that agree on one directive.** The
   * requirement is that the policy is *the same one* whether the response is
   * the application or an answer from its interface -- a policy carried by
   * only one of the two protects only one of them, and an analyst meets both.
   *
   * Checking each carries `default-src 'self'` cannot see the drift that
   * matters: two policies, one of them missing a directive the other has, both
   * satisfying that check. So they are compared whole.
   */
  it('carries one content policy, on the application and on the API alike', async () => {
    const onThePage = (await headersOf('/')).get('content-security-policy')
    const onTheApi = (await headersOf('/api/health')).get('content-security-policy')

    expect(onThePage, 'no policy on the application').toBeTruthy()
    expect(onTheApi, 'no policy on the interface').toBeTruthy()
    expect(onThePage, 'the application allows any origin').toContain("default-src 'self'")

    expect(onTheApi, 'the two responses carry different policies').toBe(onThePage)
  }, 60_000)

  /**
   * **The posture this reverses was decided and its reason was deleted.**
   * `'unsafe-eval'` was to be carried permanently to admit Alpine.js, in the
   * Jinja screens - a tier removed on 2026-08-02. Nothing in the React build
   * evaluates at run time, and the reference viewer already runs under a strict
   * policy: its boot code is a served file rather than an inline script for
   * exactly that reason.
   */
  it('does not permit eval, whose only reason has been deleted', async () => {
    const csp = (await headersOf('/')).get('content-security-policy') ?? ''
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).toContain("script-src 'self'")
  }, 60_000)

  it('refuses to be framed, and refuses to be sniffed', async () => {
    const headers = await headersOf('/')
    expect(headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(headers.get('x-content-type-options')).toBe('nosniff')
  }, 60_000)

  /**
   * **`object-src 'none'` blocked the PDF preview**, and the symptom names
   * neither CSP nor the server: the `<object>` is refused, so the browser draws
   * the element's own fallback and the analyst reads *"This browser cannot show
   * a PDF inline"* - a sentence about their browser, from a policy header.
   *
   * `blob:` rather than `'self'` because the pane never points the embed at the
   * route: `ReportPdfPreview` fetches `report.pdf` so a 401 surfaces as a
   * sentence instead of a broken viewer, and hands the `<object>` the object
   * URL. Neither suite can see this - jsdom has no viewer and headless
   * Chromium renders no PDF, so what is assertable is the header.
   */
  it('admits the PDF preview, which is an object embed on a blob URL', async () => {
    const csp = (await headersOf('/')).get('content-security-policy') ?? ''
    // **The whole directive, not a substring.** `/object-src [^;]*blob:/` also
    // passes for `object-src 'none' blob:`, which refuses every embed - so the
    // guard on this directive would have been satisfied by the defect.
    expect(csp).toContain('object-src blob:')
    expect(csp).not.toMatch(/object-src[^;]*'none'/)
  }, 60_000)

  /**
   * **No HSTS, deliberately.** The app binds loopback under a certificate it
   * mints itself; pinning a browser to https for `127.0.0.1` would apply to
   * every other project on that machine.
   */
  it('does not pin the whole of localhost to https', async () => {
    expect((await headersOf('/')).get('strict-transport-security')).toBeNull()
  }, 60_000)

  /**
   * **The socket is the product, so the policy has to admit it.** Presence,
   * claims and the repaint all ride `wss:`, and a policy that forgot it would
   * leave every screen silently un-live with nothing failing on the server.
   */
  it('admits the case socket', async () => {
    const csp = (await headersOf('/')).get('content-security-policy') ?? ''
    expect(csp).toContain('wss:')
  }, 60_000)

  /**
   * **The importer's transport, which this policy refused until it was
   * listed.** The browser signs in to Azure and queries ARM itself, so the
   * whole feature is `connect-src` and nothing else -- 18 files of it were
   * dead in the shipped product against a policy of `'self' wss:`.
   *
   * **Exact origins, and the second assertion is the one that matters.**
   * `https://management.azure.com.evil.test` is a prefix of nothing but is one
   * careless wildcard away from being admitted, and `assertArmUrl` checks
   * `URL.origin` for exactly that reason.
   */
  it('admits the two Azure origins the Sentinel importer needs, and no wildcard', async () => {
    const csp = (await headersOf('/')).get('content-security-policy') ?? ''
    expect(csp).toContain('https://login.microsoftonline.com')
    expect(csp).toContain('https://management.azure.com')

    const connect = csp.split(';').find((one) => one.trim().startsWith('connect-src')) ?? ''
    expect(connect, 'a wildcard admits every host under it').not.toMatch(/\*/)
    expect(connect, 'a scheme-only source admits every https host').not.toMatch(/\shttps:(\s|$)/)
  }, 60_000)
})

/**
 * A one-pixel PNG, so the cache assertion below has a real route to ask about.
 *
 * The bytes are a whole image rather than a stub: the upload sniffs the magic
 * number and re-encodes, so anything shorter is refused before it is stored.
 */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * **A case is regulated breach data and was cacheable to disk.** Only
 * `/api/health` and the evidence download said anything about caching, so
 * every case list, timeline, entity table and compliance record was left to
 * the browser's default heuristics -- retrievable from the profile of a shared
 * or forensically-imaged machine after the analyst signed out.
 */
describe.skipIf(!runnable)('what a browser may keep', () => {
  let harness: Harness
  let admin: Persona

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const cacheOf = async (path: string): Promise<string | null> =>
    (await fetch(`${harness.base}${path}`, { headers: { cookie: admin.cookie } })).headers.get(
      'cache-control',
    )

  it.each(['/api/cases', '/api/collections', '/api/accounts', '/api/about'])(
    'refuses the browser a copy of %s',
    async (path) => {
      expect(await cacheOf(path)).toContain('no-store')
    },
  )

  /**
   * **The half that stops this being "no-store on everything".** An avatar is
   * content-addressed and served `immutable` for a year on purpose; a blanket
   * header set in middleware would silently undo that, and nothing else would
   * fail. A route's own `@Header` runs after the middleware and wins.
   */
  it('leaves a route that asked to be cached alone', async () => {
    // **Uploaded here rather than looked for.** This returned early when no
    // analyst happened to have a picture, which is every fresh install -- so
    // the assertion never ran and the case reported a pass. -> #61
    const put = await fetch(`${harness.base}/api/appearance/avatar`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'image/png' },
      body: ONE_PIXEL_PNG,
    })
    expect(put.status, 'the fixture could not put an avatar to assert on').toBe(200)

    // **`rows`, and each carries `avatarVersion`.** This read `people` and
    // `avatar`, which the route has never answered with -- so the `as` cast
    // made a shape that does not exist compile, the find was always
    // `undefined`, and the early return above fired on every install rather
    // than only on a fresh one.
    const roster = await fetch(`${harness.base}/api/appearance/roster`, {
      headers: { cookie: admin.cookie },
    })
    const { rows } = (await roster.json()) as { rows: { userId: string; avatarVersion?: number }[] }
    const withAvatar = rows.find((one) => one.avatarVersion)
    expect(withAvatar, 'the avatar was accepted and the roster does not carry it').toBeDefined()

    const cache = await cacheOf(`/api/appearance/${withAvatar!.userId}/avatar`)
    expect(cache, 'a content-addressed avatar keeps its year').toContain('immutable')
  })

  /** The application itself is a bundle with hashed names; it may be cached. */
  it('does not refuse the browser the application', async () => {
    const cache = (await fetch(`${harness.base}/`)).headers.get('cache-control') ?? ''
    expect(cache).not.toContain('no-store')
  })
})
