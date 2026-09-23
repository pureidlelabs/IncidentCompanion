/**
 * Ending a session ends what it had open: the case socket closes, for one
 * account's sessions and for every session at once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { boot, bootable, sharedAdmin, sharedAnalyst, signIn, type Harness } from './app-harness.js'

let harness: Harness
let caseId = ''
const opened: WebSocket[] = []

async function socketFor(cookie: string): Promise<WebSocket> {
  const socket = new WebSocket(`${harness.base.replace('http://', 'ws://')}/api/cases/${caseId}/live`, {
    headers: { cookie, origin: harness.base },
  })
  opened.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.on('open', () => resolve())
    socket.on('error', reject)
  })
  return socket
}

async function closedWithin(socket: WebSocket, ms: number): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (socket.readyState === socket.CLOSED) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return socket.readyState === socket.CLOSED
}

describe.skipIf(!(await bootable()))('an ended session and the socket it opened', () => {
  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)
    await sharedAnalyst(harness)
    const made = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: 'spec-claims socket probe' }),
    })
    expect(made.status).toBe(201)
    caseId = ((await made.json()) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    for (const socket of opened) socket.terminate()
    await harness?.close()
  })

  it("closes the analyst's socket when an administrator ends that account's sessions", async () => {
    const admin = await sharedAdmin(harness)
    const analyst = await sharedAnalyst(harness)
    const socket = await socketFor(analyst.cookie)
    expect(socket.readyState).toBe(socket.OPEN)

    const ended = await fetch(
      `${harness.base}/api/accounts/${encodeURIComponent(analyst.email)}/sessions/end`,
      { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin.cookie } },
    )
    expect(ended.status, await ended.clone().text()).toBe(200)

    expect(await closedWithin(socket, 8000), 'the socket outlived the session an administrator ended').toBe(true)
  }, 60_000)

  it('closes every socket when an administrator ends every session', async () => {
    const admin = await sharedAdmin(harness)
    const analyst = await signIn(harness, (await sharedAnalyst(harness)).email)
    const socket = await socketFor(analyst.cookie)

    const ended = await fetch(`${harness.base}/api/accounts/sessions/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
    })
    expect(ended.status, await ended.clone().text()).toBe(200)

    expect(await closedWithin(socket, 8000), 'a socket survived ending every session').toBe(true)
  }, 60_000)
})
