/**
 * Turn the client into something that needs no server.
 *
 * Loaded by a dynamic import that only the demo build reaches, so none of this
 * - the handler, the seeded case - is in the bundle a self-hosted install
 * serves.
 */
import { setSession } from '@/api/session'
import { setTransport } from '@/api/client'

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

export async function installDemo(): Promise<void> {
  signIn()
  let state = await load()

  setTransport(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = await handle(state, url, init)

    const method = (init.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && response.ok) await save(state)
    return response
  })

  // The visitor's way back to a case nobody has edited. On `window` because the
  // demo has no screen of its own to put a control on.
  Object.defineProperty(window, 'resetDemo', {
    value: async () => {
      state = await reset()
      window.location.reload()
    },
  })
}
