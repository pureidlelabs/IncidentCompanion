/**
 * An install reached at a name of its own, with the Sentinel importer turned
 * on by its operator: what every response tells the browser about where the
 * page may connect, and that the application says nothing about the
 * connection itself.
 *
 * `security-headers.test.ts` holds the loopback install with nothing turned on.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'
import { sourcesOf } from './content-policy.js'

const runnable = await bootable()

describe.skipIf(!runnable)('an install named ir.example.org that imports from Sentinel', () => {
  let harness: Harness

  beforeAll(async () => {
    vi.stubEnv('AUTH_BASE_URL', 'https://ir.example.org:8443')
    vi.stubEnv('IC_SENTINEL_IMPORTER', 'on')
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
    vi.unstubAllEnvs()
  })

  it('names its own socket and the two Azure origins, exactly', async () => {
    for (const path of ['/', '/api/health']) {
      const csp = (await fetch(`${harness.base}${path}`)).headers.get('content-security-policy') ?? ''
      expect(sourcesOf(csp, 'connect-src'), path).toEqual([
        "'self'",
        'wss://ir.example.org:8443',
        'https://login.microsoftonline.com',
        'https://management.azure.com',
      ])
    }
  }, 60_000)

  /**
   * **One source of HSTS, and it is the edge.** Sent here as well, a name
   * gets the header twice and a loopback response reached through the same
   * application gets a year's pin it must never carry.
   */
  it('says nothing about the connection, which only the edge holds', async () => {
    const answer = await fetch(`${harness.base}/`)
    expect(answer.headers.get('strict-transport-security')).toBeNull()
  }, 60_000)
})
