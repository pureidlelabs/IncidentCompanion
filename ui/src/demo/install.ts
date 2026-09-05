/**
 * Turn the client into something that needs no server.
 */
import { setSession } from '@/api/session'
import { setTransport } from '@/api/client'

import { showBadge } from './badge'
import { handle, DEMO_ANALYST } from './handler'
import { landingPath } from './landing'
import { load, reset, save } from './store'

/**
 * A signed-in analyst, written before the first render.
 */
function signIn(): void {
  setSession({ userId: DEMO_ANALYST, username: 'Demo analyst' })
}

/**
 * A socket that never connects and never closes.
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

  // **The picker's default pane hides demo cases and the only case here is
  // one**, so the bare address otherwise opens on `0 cases` - an empty screen
  // for a visitor who came to see the product full.
  //
  // A navigation rather than `history.replaceState`, which does not work here:
  // `routes.tsx` builds its router at module scope, and that module is
  // imported - and has already resolved `/` to the picker - before this runs.
  // Reloading costs one request on the bare address and depends on no import
  // ordering. It cannot loop: the path it lands on is no longer the root, so
  // the next call answers nothing.
  const landing = landingPath(window.location.pathname, state.kase.id, import.meta.env.BASE_URL)
  if (landing !== null) {
    window.location.replace(landing)
    return
  }

  showBadge(import.meta.env.VITE_DEMO_BUILD ?? 'local', () => {
    void reset().then(() => {
      window.location.reload()
    })
  })
}
