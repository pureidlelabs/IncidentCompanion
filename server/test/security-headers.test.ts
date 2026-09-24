/**
 * **What every response tells the browser it may do.**
 *
 * This process serves the application as well as the API, which is why the
 * policy matters more here than for a pure API: without one a page goes out
 * with nothing said about what it may load, whether it may be framed, or
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
import { sourcesOf } from './content-policy.js'

/**
 * **`skipIf` here is a boot check, not a gap in the gate.** `bootable()` is
 * false only where no database can be reached, and the landing command
 * `test_scope.py` prints boots one -- so a skip here means no stack, not an
 * assertion quietly dropped. A suite that cannot boot has nothing to assert
 * against, and saying so beats failing.
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
   * **Nothing in this application needs it.** The React build evaluates
   * nothing at run time, and the reference viewer already runs under a strict
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
   * **`object-src 'none'` blocks the PDF preview**, and the symptom names
   * neither CSP nor the server: the `<object>` is refused, so the browser draws
   * the element's own fallback and the analyst reads *"This browser cannot show
   * a PDF inline"* - a sentence about their browser, from a policy header.
   *
   * `blob:` rather than `'self'` admits an embed pointed at an object URL and
   * not one pointed at the route, which is what a client fetching the PDF
   * itself would need -- so a 401 could surface as a sentence rather than a
   * broken viewer. **No client pane draws such an embed today**, so the
   * directive is ahead of the screen it is for, and this case holds the header
   * alone. Neither suite could see the pane either: jsdom has no viewer and
   * headless Chromium renders no PDF. -> #372
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
   * **The application never holds the protected connection, so it says
   * nothing about it.** The edge answers HSTS from the host it was reached
   * at; `a-named-install-names-only-itself.test.ts` holds the named half.
   */
  it('does not pin the whole of localhost to https', async () => {
    expect((await headersOf('/')).get('strict-transport-security')).toBeNull()
  }, 60_000)

  /**
   * **Exactly the install's own socket, and no destination the operator did
   * not choose.** A scheme on its own admits every host speaking it, which a
   * wildcard check does not see; the import platform is named only on an
   * install that turned importing from it on, which this one did not.
   * `a-named-install-names-only-itself.test.ts` holds the other half.
   */
  it('names only the install itself as a destination, with no scheme on its own', async () => {
    const csp = (await headersOf('/')).get('content-security-policy') ?? ''
    expect(sourcesOf(csp, 'connect-src')).toEqual(["'self'", 'ws://127.0.0.1', 'ws://localhost'])
  }, 60_000)

  it('offers no importer the operator did not turn on', async () => {
    const admin = await sharedAdmin(harness)
    const offered = await fetch(`${harness.base}/api/imports`, { headers: { cookie: admin.cookie } })
    expect(await offered.json()).toEqual({ sentinel: false })
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
 * **A case is regulated breach data, and a browser keeps what it is not told
 * not to.** A case list, a timeline, an entity table or a compliance record
 * left to the browser's default heuristics is retrievable from the profile of
 * a shared or forensically-imaged machine after the analyst signs out.
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
    // **Uploaded here rather than looked for.** Looking for an existing
    // picture returns early when no analyst has one, which is every fresh
    // install -- so the assertion never runs and the case reports a pass.
    // -> #61
    const put = await fetch(`${harness.base}/api/appearance/avatar`, {
      method: 'PUT',
      headers: { cookie: admin.cookie, 'content-type': 'image/png' },
      body: ONE_PIXEL_PNG,
    })
    expect(put.status, 'the fixture could not put an avatar to assert on').toBe(200)

    // **`rows`, and each carries `avatarVersion`.** An `as` cast on a fetch
    // response makes a shape the route never answers with compile, so a field
    // name that is wrong here leaves the find always `undefined` and the early
    // return above firing on every install rather than only on a fresh one.
    const roster = await fetch(`${harness.base}/api/appearance/roster`, {
      headers: { cookie: admin.cookie },
    })
    const { rows } = (await roster.json()) as { rows: { userId: string; avatarVersion?: number }[] }
    // **This admin's own row, not the first row carrying a version.** The
    // roster is every account on a shared install, so `find` by the field
    // alone returns whichever account another suite happened to give a picture
    // to - and that one's avatar is not on this harness, so the route 404s and
    // the assertion reads the refusal's `no-store` as a missing header. It
    // fails only when the scheduler runs the right pair together, which is a
    // test file being added anywhere in the tier.
    const withAvatar = rows.find((one) => one.userId === admin.id && one.avatarVersion)
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
