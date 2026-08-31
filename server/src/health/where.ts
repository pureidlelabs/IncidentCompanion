/**
 * Whether a dependency is on this machine, derived from its own URL.
 *
 * Answers one of three words and never a hostname, so nothing that renders it
 * can publish an address.
 */
export type Where = 'this machine' | 'elsewhere' | 'unknown'

/** `localhost` counts as loopback beside `127.0.0.1`, not only the literal. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function whereIs(url: string): Where {
  try {
    const { hostname } = new URL(url)
    return LOOPBACK.has(hostname) ? 'this machine' : 'elsewhere'
  } catch {
    /**
     * **Unknown, never "this machine".** Guessing local is the guess that
     * makes the screen claim the host's figures describe the database, which
     * is the confusion this function exists to remove.
     */
    return 'unknown'
  }
}
