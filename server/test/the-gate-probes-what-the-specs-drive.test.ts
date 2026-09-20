/**
 * The browser tier's prerequisite gate, held to the URL its specs actually drive.
 *
 * **The gate read a project's `baseURL` and the projects do not agree.** One of
 * them is pinned to the built bundle on the API port, the rest inherit the dev
 * server's -- so whichever happened to be first decided what the gate demanded,
 * and a certifying run was refused over a bundle three of the four never read.
 * -> #995
 */
import { describe, expect, it } from 'vitest'

import { APP_URL, DIST_URL } from '../e2e/support/app-url.js'

interface Configured {
  use?: { baseURL?: string }
  projects?: readonly { name?: string; use?: { baseURL?: string } }[]
}

const config = async (): Promise<Configured> =>
  (await import('../e2e/playwright.config.js')).default

describe('the browser tier asks for what it drives', () => {
  it('points the specs at the app URL, which is what the gate probes', async () => {
    expect((await config()).use?.baseURL).toBe(APP_URL)
  })

  /**
   * **The two URLs differ, which is what made reading a project wrong.** Were
   * they the same the old gate would have been right by luck, and this file
   * would be asserting nothing.
   */
  it.skipIf(process.env['VISUAL_TARGET'] === 'dist')(
    'serves the built bundle from somewhere else again',
    () => {
      expect(DIST_URL).not.toBe(APP_URL)
    },
  )

  /**
   * The gate has no business reading this, and the assertion is the reason:
   * the first project is the built client, whose URL is the one the chromium
   * project does not use.
   */
  it.skipIf(process.env['VISUAL_TARGET'] === 'dist')(
    'puts a project the gate must not read first',
    async () => {
      const [first] = (await config()).projects ?? []
      expect(first?.use?.baseURL, 'no first project to disagree with').toBe(DIST_URL)
      expect(first?.use?.baseURL).not.toBe(APP_URL)
    },
  )
})
