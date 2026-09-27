/**
 * The demo answers the socket, the auth client and the landing route through
 * the app's own seams, and leaves `fetch`, `WebSocket` and the document alone.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { authClient } from '@/api/authClient'
import { acquireLink, releaseLink } from '@/api/caseSocket'
import { DEMO_ANALYST } from './handler'
import { installDemo } from './install'

class Untouched {
  close() {
    /* never opened */
  }
}

afterEach(() => {
  document.querySelector('[data-part="demo-chrome"]')?.remove()
})

describe('installing the demo', () => {
  it('lands on the case without loading the document again', async () => {
    window.history.replaceState(null, '', '/')
    const fetchBefore = globalThis.fetch
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = Untouched

    await installDemo()

    expect(window.location.pathname).toMatch(/^\/cases\/[^/]+\/timeline$/)
    expect(globalThis.fetch).toBe(fetchBefore)
    expect(globalThis.WebSocket).toBe(Untouched)
  })

  it('answers the case socket in the browser', async () => {
    await installDemo()

    const link = acquireLink('demo-probe')
    await Promise.resolve()

    expect(link.connected).toBe(true)
    releaseLink('demo-probe')
  })

  it('answers the auth client with the demo analyst', async () => {
    await installDemo()

    const session = await authClient.getSession()

    expect(session.data?.user.id).toBe(DEMO_ANALYST)
  })
})
