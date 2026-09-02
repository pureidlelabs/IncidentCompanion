/**
 * **A request for data is never answered with a page**, driven through the
 * booted app rather than against a model of the routing.
 *
 * The failure is a `/api` request answered with `index.html` and a 200, whose
 * symptom is a client-side JSON error naming `<!doctype` - so the assertion is
 * on the bytes the server actually sent, and holds whatever the exclusion list
 * says.
 *
 * **The path that matters is the one no route defines.** A defined route
 * answers itself; a mistyped or retired one falls through to the catch-all,
 * which is the only place the shell can be served by mistake.
 *
 * **`UI_DIR` points at a shell written here, and that is what makes the file
 * assert anything.** Without a bundle the catch-all answers 404 for every
 * path, so a lost exclusion changes one refusal into another and every
 * assertion below passes while proving nothing. CI's server tier does not
 * build the client, so relying on `ui/dist` would be vacuous exactly where it
 * is relied on most.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const runnable = await bootable()

/** The two markers a served shell carries, either of which gives it away. */
function looksLikeAPage(body: string): boolean {
  return /^\s*<!doctype html/i.test(body) || /<div id="root"/i.test(body)
}

describe.skipIf(!runnable)('a request for data is never answered with a page', () => {
  let harness: Harness
  let shellDir: string
  let previousUiDir: string | undefined

  beforeAll(async () => {
    shellDir = mkdtempSync(join(tmpdir(), 'ic-shell-'))
    writeFileSync(
      join(shellDir, 'index.html'),
      '<!doctype html><html><body><div id="root"></div></body></html>',
    )
    previousUiDir = process.env.UI_DIR
    process.env.UI_DIR = shellDir

    harness = await boot()
  })

  afterAll(async () => {
    await harness.close()
    if (previousUiDir === undefined) delete process.env.UI_DIR
    else process.env.UI_DIR = previousUiDir
    rmSync(shellDir, { recursive: true, force: true })
  })

  /**
   * Without this the whole file is vacuous: every assertion below is that some
   * path did *not* get the shell, and a server with no shell to give passes
   * all of them.
   */
  it('has a shell to mis-serve, or nothing below is a test', async () => {
    const response = await fetch(`${harness.base}/cases`)

    expect(looksLikeAPage(await response.text())).toBe(true)
    expect(response.status).toBe(200)
  })

  /**
   * Paths under the API that no route defines, each a shape a client can
   * produce by accident. `/api` bare is listed because a wildcard wanting a
   * segment after the slash does not match it.
   */
  const UNDEFINED_API_PATHS = [
    '/api',
    '/api/nonsense',
    '/api/cases/abc/timeline/deeper/still',
    '/api/docs/assets/redoc.standalone.js',
  ]

  it.each(UNDEFINED_API_PATHS)('%s says it does not exist, in JSON', async (path) => {
    const response = await fetch(`${harness.base}${path}`)
    const body = await response.text()

    expect(looksLikeAPage(body), `${path} was answered with the app shell`).toBe(false)
    expect(response.headers.get('content-type') ?? '').toMatch(/application\/json/)
    expect(response.status, `${path} did not say the route is absent`).toBe(404)
  })

  /**
   * A path a route *does* serve, spelled so the handler can never run. It
   * belongs in this file because the risk is the same - a program gets a
   * document where it expected an answer - but not in the list above: the
   * route exists, so 404 is the wrong claim to make about it.
   */
  it('answers a malformed id with data too', async () => {
    const response = await fetch(`${harness.base}/api/cases/not-a-uuid`)

    expect(looksLikeAPage(await response.text())).toBe(false)
    expect(response.headers.get('content-type') ?? '').toMatch(/application\/json/)
  })

  /**
   * **The bundle's own directory, which the shell must not stand in for.**
   * A missing asset answered with `index.html` is a 200 the browser then tries
   * to run as JavaScript, so the miss has to stay a miss.
   *
   * This is the exclusion that a private copy of the list in
   * `spa.module.test.ts` had drifted out of, which is why it is asserted
   * through a real request.
   */
  it('leaves a missing bundle asset a miss', async () => {
    const response = await fetch(`${harness.base}/assets/index-does-not-exist.js`)

    expect(looksLikeAPage(await response.text())).toBe(false)
    expect(response.status).toBe(404)
  })

  /**
   * The other half, without which excluding everything would pass: a deep link
   * an analyst pastes has to reach the shell rather than a refusal. `/apiary`
   * is here because a bare prefix match on `/api` would take it.
   */
  it.each(['/', '/cases/abc/timeline', '/apiary'])(
    '%s is claimed by the app, not left to the API',
    async (path) => {
      const response = await fetch(`${harness.base}${path}`)

      expect(looksLikeAPage(await response.text()), `${path} was refused`).toBe(true)
    },
  )

  /**
   * **Where the other half of *An analyst reloads on a case* is asserted.**
   *
   * The scenario asks for two things -- *the application's page is served* and
   * *the case opens where they were*. The case above is the first, and it is
   * all this tier can see: a page is a page, and whether the case opens is
   * decided by the router inside it.
   *
   * The second is `ui/src/app/case/CaseFrameContainer.test.tsx`, which mounts
   * at `/cases/c-1/timeline` and asserts the routed section draws. Written
   * down because a reader checking whether the scenario is demonstrated will
   * find this file first, and half a scenario asserted looks the same as a
   * whole one from here.
   */
  it('serves the page at a deep case address rather than a bare one', async () => {
    const deep = await fetch(`${harness.base}/cases/abc/timeline`)
    const root = await fetch(`${harness.base}/`)

    expect(deep.status, 'a reload on a case is not an error').toBe(200)
    expect(
      await deep.text(),
      'the deep address is served something other than the shell',
    ).toBe(await root.text())
  })
})
