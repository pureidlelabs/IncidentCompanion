/**
 * Turn the client into something that needs no server.
 *
 * Loaded by a dynamic import that only the demo build reaches, so none of this
 * - the handler, the seeded case - is in the bundle a self-hosted install
 * serves.
 */
import { setSession } from '@/api/session'
import { setSocketFactory } from '@/api/caseSocket'
import { setTransport } from '@/api/transport'

import { mountDemoChrome } from './chrome'
import { handle, DEMO_ANALYST } from './handler'
import { LoopbackSocket, forgetProse, seedLoopback, seedNote } from './loopback'
import { landingPath } from './landing'
import { markWritten, seedReportProse, type DemoState } from './state'
import { load, reset, save } from './store'

/**
 * A signed-in analyst, written before the first render.
 *
 * `useBootSession` renders from a stored hint and treats a failed session probe
 * as a no-op while one is present, which is the whole of skipping a sign-in
 * screen with nothing to talk to.
 */
function signIn(): void {
  setSession({ userId: DEMO_ANALYST, username: 'Demo analyst', demo: true })
}

/**
 * The case socket, answered from the browser.
 *
 * The loopback never closes, on purpose: `caseSocket.ts` schedules its
 * reconnect from `onclose` alone.
 *
 * A note's field is `casenotes:<id>:document`; its document starts from the
 * row's `note` column and writes back into it, as the server does on a flush.
 */
function answerSockets(state: DemoState): void {
  const noteOf = (field: string): Record<string, unknown> | undefined => {
    const match = /^casenotes:([^:]+):document$/.exec(field)
    if (!match) return undefined
    const rows = (state.kase as unknown as { casenotes?: Record<string, unknown>[] }).casenotes
    return rows?.find((row) => row.id === match[1])
  }
  seedLoopback({
    seedInto: (doc, field) => {
      const note = noteOf(field)?.note
      if (typeof note === 'string' && note !== '') seedNote(doc, note)
      else seedReportProse(state, doc, field)
    },
    onText: (field, text) => {
      const row = noteOf(field)
      if (row === undefined || row.note === text) return
      row.note = text
      void save(state)
    },
  })
  setSocketFactory((url) => new LoopbackSocket(url))
}

export async function installDemo(): Promise<void> {
  signIn()
  const state = await load()
  // A case stored by an earlier build carries no marks, and nothing versions
  // the stored document.
  markWritten(state.kase)
  answerSockets(state)

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
  // The router reads the address when the app first renders, which is after this.
  const landing = landingPath(window.location.pathname, state.kase.id, import.meta.env.BASE_URL)
  if (landing !== null) window.history.replaceState(null, '', landing)

  mountDemoChrome({
    build: import.meta.env.VITE_DEMO_BUILD ?? 'local',
    onReset: () => {
      forgetProse()
      void reset().then(() => {
        window.location.reload()
      })
    },
  })
}
