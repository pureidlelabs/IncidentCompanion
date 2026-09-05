/**
 * The tenant and client coordinates the Connect phase collects, kept in
 * `localStorage`.
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
