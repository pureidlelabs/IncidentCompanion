/**
 * An install reached at a name of its own, with the Sentinel importer turned
 * on by its operator: what every response tells the browser about where the
 * page may connect, and that the application says nothing about the
 * connection itself.
 *
 * `security-headers.test.ts` holds the loopback install with nothing turned on.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, type Harness } from './app-harness.js'
import { sourcesOf } from './content-policy.js'

const runnable = await bootable()

describe.skipIf(!runnable)('an install named ir.example.org that imports from Sentinel', () => {
  let harness: Harness

  beforeAll(async () => {
    vi.stubEnv('AUTH_BASE_URL', 'https://ir.example.org:8443')
    vi.stubEnv('IC_IMPORTERS', 'sentinel')
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

  it('offers the importer the operator turned on', async () => {
    const admin = await sharedAdmin(harness)
    const offered = await fetch(`${harness.base}/api/imports`, { headers: { cookie: admin.cookie } })
    expect(await offered.json()).toEqual({ sentinel: true })
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

  /**
   * **The socket admits exactly the origins sign-in admits.** Each case sends
   * a `Host` matching its `Origin`, as the edge forwards it, so only the set
   * decides. No cookie: `401` is past the origin check, `403` is refused by it.
   */
  it.each([
    ['https://ir.example.org:8443', 'ir.example.org:8443', 401],
    ['http://ir.example.org:8443', 'ir.example.org:8443', 403],
    ['https://ir.example.org', 'ir.example.org', 403],
    ['https://localhost:8443', 'localhost:8443', 403],
  ])('answers a socket from %s at %s with %i', async (origin, host, status) => {
    const socket = new WebSocket(
      `${harness.base.replace('http://', 'ws://')}/api/cases/00000000-0000-4000-8000-000000000000/live`,
      { headers: { origin, host } },
    )
    const answered = await new Promise<number>((resolve) => {
      socket.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? 0)
      })
      socket.on('open', () => {
        resolve(101)
      })
      socket.on('error', () => undefined)
    })
    socket.terminate()
    expect(answered).toBe(status)
  }, 30_000)
})
