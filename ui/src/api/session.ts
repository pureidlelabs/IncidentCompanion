/**
 * Who is signed in, as far as the UI needs to know. **Not the credential.**
 *
 * The credential is Better Auth's `HttpOnly` session cookie, attached by the
 * browser because every fetch in `client.ts` sends `credentials: 'include'`.
 * No script in this origin can read it and nothing here holds a token.
 *
 * **This is a cache of Better Auth's session, not a second one.** The server
 * is the only authority on who this cookie is; `useBootSession` asks it once
 * per load and writes the answer here. What that buys is a first paint with no
 * round trip in front of it - the reason a `localStorage` copy exists at all,
 * since losing it on reload made a reload look like a sign-out while the
 * cookie stayed valid. Storing it is safe in a way storing a bearer never was:
 * it authorises nothing, and a stale copy buys an attacker a name and an id
 * they could read off the screen.
 *
 * **Optimistic, and corrected by the server.** A hint restored from a browser
 * whose cookie has since expired mounts the workspace, whose first request
 * 401s; `client.ts` clears the hint there and `App` falls back to the sign-in
 * form. The reverse - probing the API before mounting anything - costs a round
 * trip on every load to answer a question the first real request answers
 * anyway.
 */

export interface Session {
  /**
   * **The account's id, and the only thing here that addresses anybody.**
   *
   * `username` is `user.name`, which the server does not make unique, so it
   * shows an analyst and never identifies one. An avatar URL, a presence
   * disc's *is this me*, and a row's attribution all key on this.
   *
   * **Required, which is what makes a stored hint from before it existed
   * unusable** - `restore` drops such a hint rather than returning half an
   * identity, and the analyst signs in once more. There is no install to
   * migrate; the alternative is every consumer holding an `undefined` branch
   * for a case that lasts one reload.
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
