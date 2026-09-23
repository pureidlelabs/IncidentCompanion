/**
 * A case records in its report whether the booted app served it, which is what
 * lets a ledger row cite it as reaching the product through its entry point.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { HealthController } from '../src/health/health.controller.js'

import { boot, bootable, type Harness } from './app-harness.js'

let harness: Harness | null = null

describe.skipIf(!(await bootable()))('a case is tagged by what it drove', () => {
  beforeAll(async () => {
    harness = await boot()
    // No case is running yet, so this request tags nothing.
    expect((await fetch(`${harness.base}/api/health`)).status).toBe(200)
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('leaves a case that reached a service by hand untagged', async ({ task }) => {
    await harness!.app.get(HealthController, { strict: false }).check()
    expect(task.meta.served).toBeUndefined()
    expect(task.meta.socket).toBeUndefined()
  })

  it('tags a case the app served a request', async ({ task }) => {
    expect((await fetch(`${harness!.base}/api/health`)).status).toBe(200)
    expect(task.meta.served).toBe(true)
    expect(task.meta.socket).toBeUndefined()
  })

  it('tags a case that asked the app for a socket', async ({ task }) => {
    const url = `${harness!.base.replace('http', 'ws')}/api/cases/${crypto.randomUUID()}/live`
    const socket = new WebSocket(url)
    await new Promise((settled) => {
      socket.once('close', settled)
      socket.once('error', settled)
    })
    expect(task.meta.socket).toBe(true)
  })
})
