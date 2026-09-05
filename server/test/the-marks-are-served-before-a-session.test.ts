/**
 * The marks that identify the application are served with no session, and are
 * the ones that shipped.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

/** Served path to the file that ships it. */
const MARKS: Readonly<Record<string, string>> = {
  '/favicon.ico': 'favicon.ico',
  '/favicon.svg': 'favicon.svg',
}

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))

let harness: Harness | null = null

describe.skipIf(!(await bootable()))('the marks that identify the application', () => {
  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it.each(Object.keys(MARKS))('serves %s to a browser with no session', async (path) => {
    const answer = await fetch(`${harness!.base}${path}`)

    expect(
      answer.status,
      `${path} is refused without a session, so a browser cannot draw the tab before ` +
        'anybody signs in',
    ).toBe(200)
    expect((await answer.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it.each(Object.entries(MARKS))('serves %s as the file that shipped it', async (path, file) => {
    const served = Buffer.from(
      await (await fetch(`${harness!.base}${path}`)).arrayBuffer(),
    )
    const shipped = readFileSync(`${ASSETS}${file}`)

    expect(
      served.equals(shipped),
      `${path} is not the file in the repository, so what a browser is shown before signing ` +
        'in is assembled at request time and can carry whatever the assembler reaches',
    ).toBe(true)
  })

  /**
   * The neighbour that is *not* a mark, so the claim above is about these two
   * files rather than about everything anonymous.
   */
  it('keeps the appearance an install chose behind a session', async () => {
    expect((await fetch(`${harness!.base}/api/appearance`)).status).toBe(401)
  })
})
