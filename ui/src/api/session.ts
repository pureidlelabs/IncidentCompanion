/**
 * Who is signed in, as far as the UI needs to know. **Not the credential.**
 */

export interface Session {
  /**
   * **The account's id, and the only thing here that addresses anybody.**
   */
  readonly userId: string
  readonly username: string
}

/**
 * Namespaced because everything is served from one origin, so this
 * store is shared with every script the product already runs there.
 */
const IDENTITY_KEY = 'incidentcompanion.identity'

function restore(): Session | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { userId, username } = parsed as Record<string, unknown>
    // **Both, or nothing.** A hint carrying only a name is one the app cannot
    // draw a face or an attribution from, and every consumer would need a
    // branch for it. Dropping it costs one sign-in, once.
    if (typeof userId !== 'string' || typeof username !== 'string') return null
    return { userId, username }
  } catch {
    // Hand-edited, quota-denied or a private-mode `localStorage` that throws on
    // read. None of them is a reason to fail to boot: no hint means sign in.
    return null
  }
}

let current: Session | null = restore()
const listeners = new Set<(session: Session | null) => void>()

export function getSession(): Session | null {
  return current
}

export function setSession(session: Session | null): void {
  current = session
  try {
    if (session === null) window.localStorage.removeItem(IDENTITY_KEY)
    else window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(session))
  } catch {
    // A full or blocked store costs the reload-keeps-you-signed-in behaviour
    // and nothing else - the cookie is still the credential.
  }
  for (const listener of listeners) listener(session)
}

export function subscribe(listener: (session: Session | null) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam. Production code never calls this; `setSession(null)` is sign-out. */
export function resetSessionForTest(): void {
  current = null
  listeners.clear()
  try {
    window.localStorage.removeItem(IDENTITY_KEY)
  } catch {
    /* nothing stored, nothing to clear */
  }
}
