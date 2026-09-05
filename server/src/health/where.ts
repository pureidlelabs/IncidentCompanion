/**
 * Whether a dependency is on this machine, derived from its own URL.
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
     * **Unknown, never "this machine".**
     */
    return 'unknown'
  }
}
