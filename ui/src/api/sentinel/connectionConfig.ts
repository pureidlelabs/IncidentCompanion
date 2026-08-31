/**
 * The tenant and client coordinates the Connect phase collects, kept in
 * `localStorage`.
 *
 * **Client-side because it is connection config, not case data.** It says
 * which Azure directory this browser signs in to; it belongs to no case, and
 * archiving a case that carried it would hand somebody else a tenant id. The
 * server has no preference surface it fits either - `prefs` is install-wide
 * and reaching for one would put an Azure coordinate on the app's own disk to
 * serve a connection the app never makes.
 *
 * **No secret is ever stored here.** The designed sign-in is auth-code with
 * PKCE, which has no client secret; a token would be session-lifetime and is
 * not persisted at all. If a field that looks like a secret ever arrives, this
 * is the wrong place for it.
 *
 * Namespaced like `session.ts`'s identity key, so one `incidentcompanion.`
 * prefix covers everything this app leaves in a browser store.
 */

export const CONNECTION_KEY = 'incidentcompanion.sentinel-connection'

export interface ConnectionConfig {
  tenantId: string
  clientId: string
}

export const EMPTY_CONNECTION: ConnectionConfig = { tenantId: '', clientId: '' }

function readField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * What was stored, or blanks.
 *
 * Every field is read individually and defaulted: the store is hand-editable
 * and survives a version of this app that wrote a different shape, so a
 * missing key has to read as empty rather than as `undefined` reaching an
 * input and turning it uncontrolled.
 */
export function loadConnection(): ConnectionConfig {
  try {
    const raw = window.localStorage.getItem(CONNECTION_KEY)
    if (raw === null) return { ...EMPTY_CONNECTION }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_CONNECTION }
    const record = parsed as Record<string, unknown>
    return {
      tenantId: readField(record.tenantId),
      clientId: readField(record.clientId),
    }
  } catch {
    // Private mode, a disabled store, or hand-edited JSON. Blanks keep the
    // phase usable; a throw here takes the whole section down.
    return { ...EMPTY_CONNECTION }
  }
}

export function saveConnection(config: ConnectionConfig): void {
  try {
    window.localStorage.setItem(CONNECTION_KEY, JSON.stringify(config))
  } catch {
    // A store that refuses the write still has to leave the form usable; the
    // config is retyped next session, which is the whole cost.
  }
}

export function clearConnection(): void {
  try {
    window.localStorage.removeItem(CONNECTION_KEY)
  } catch {
    /* nothing to clear if the store is unreachable */
  }
}
