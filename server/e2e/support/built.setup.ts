import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

const run = promisify(execFile)

/**
 * Builds the client the project depending on this one drives.
 *
 * **A build rather than a check that one exists.** `dist` is the only input
 * this tier has that can be silently out of date: a stale one answers every
 * probe a fresh one does, so a spec passes against code nobody is running and
 * reads as a fix that did apply. Building it here is what makes that
 * impossible -- `playwright.config.ts` gives the same reason where it explains
 * why the dev server is the default target.
 */
test('the client is built, and the server serves it', async ({ request }) => {
  test.setTimeout(300_000)

  await run('npm', ['run', 'build'], {
    cwd: join(__dirname, '../../../ui'),
    // Rolldown prints its chunk-size advice on every run.
    maxBuffer: 32 * 1024 * 1024,
  })

  /**
   * **The served document, not the file on disk.** Nest serves the build, and
   * the failure this project exists to prevent is a browser handed a document
   * with no stylesheet in it -- which is what the dev server sends, and what no
   * amount of building would change.
   */
  const served = await (await request.get('/')).text()
  expect(
    served,
    'the server answered a document with no stylesheet, so nothing can paint a ground in the first frame',
  ).toContain('rel="stylesheet"')
})
