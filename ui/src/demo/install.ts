/**
 * Turn the client into something that needs no server.
 *
 * Loaded by a dynamic import that only the demo build reaches, so none of this
 * - the handler, the seeded case - is in the bundle a self-hosted install
 * serves.
 */
import { setSession } from '@/api/session'
import { setTransport } from '@/api/client'

import { showBadge } from './badge'
import { handle, DEMO_ANALYST } from './handler'
import { load, reset, save } from './store'

/**
 * A signed-in analyst, written before the first render.
 *
 * `useBootSession` renders from a stored hint and treats a failed session probe
 * as a no-op while one is present, which is the whole of skipping a sign-in
 * screen with nothing to talk to.
 */
function signIn(): void {
  setSession({ userId: DEMO_ANALYST, username: 'Demo analyst' })
}

/**
 * A socket that never connects and never closes.
 *
 * The three hooks that open the case socket construct `new WebSocket(url)`
 * inline, so the substitution is the global rather than a factory threaded
 * through them. Inert in both directions on purpose: `caseSocket.ts` schedules
 * its reconnect from `onclose` alone, so a stub that never fires one schedules
 * nothing, where a stub reporting a close would reconnect every ten seconds
 * against a demo that has no server to reach.
 */
function silenceSockets(): void {
  class Inert {
    readonly url: string
    onopen: unknown = null
    onclose: unknown = null
    onmessage: unknown = null
    onerror: unknown = null
    readonly readyState = 0
    constructor(url: string) {
      this.url = url
    }
    send(): void {
      /* nothing is listening */
    }
    close(): void {
      /* never opened */
    }
  }
  window.WebSocket = Inert as unknown as typeof WebSocket
}

export async function installDemo(): Promise<void> {
  signIn()
  silenceSockets()
  const state = await load()

  setTransport(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = await handle(state, url, init)

    const method = (init.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && response.ok) await save(state)
    return response
  })

  showBadge(import.meta.env.VITE_DEMO_BUILD ?? 'local', () => {
    void reset().then(() => {
      window.location.reload()
    })
  })
}
