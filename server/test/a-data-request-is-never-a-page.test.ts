/**
 * **A request for data is never answered with a page**, driven through the
 * booted app rather than against a model of the routing.
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
  }, 90_000)

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
   * Paths under the API that no route defines, each a shape a client can produce
   * by accident.
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
   * A path a route *does* serve, spelled so the handler can never run.
   */
  it('answers a malformed id with data too', async () => {
    const response = await fetch(`${harness.base}/api/cases/not-a-uuid`)

    expect(looksLikeAPage(await response.text())).toBe(false)
    expect(response.headers.get('content-type') ?? '').toMatch(/application\/json/)
  })

  /**
   * **The bundle's own directory, which the shell must not stand in for.**
   */
  it('leaves a missing bundle asset a miss', async () => {
    const response = await fetch(`${harness.base}/assets/index-does-not-exist.js`)

    expect(looksLikeAPage(await response.text())).toBe(false)
    expect(response.status).toBe(404)
  })

  /**
   * The other half, without which excluding everything would pass: a deep link
   * an analyst pastes has to reach the shell rather than a refusal.
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
