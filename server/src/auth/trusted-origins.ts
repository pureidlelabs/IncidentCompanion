/**
 * Which origins may drive this server, given the base URL and the run mode.
 *
 * **This is CSRF defence, not configuration.** The check is what stops a page
 * on another site making an authenticated request with the browser's cookie
 * attached, so every entry is a decision about who may act as the analyst.
 * `SameSite=Lax` on the session cookie is the other half.
 *
 * The three loopback spellings of the base URL's own origin are the same
 * interface written three ways and grant nothing. **Another port, another
 * scheme or a wildcard is a real widening** - the Vite entry below is the one
 * exception and it is development-only. `trusted-origins.test.ts` holds the
 * boundary.
 */

/** The three ways a browser writes "this machine". */
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'] as const

/**
 * The port Vite serves the app from while developing, or null.
 *
 * **Read from `IC_VITE_PORT`, never defaulted.** Every port here is derived by
 * `server/scripts/stack.mjs` and exported by `dev-node.sh`, so a worktree's
 * Vite is not the main checkout's. Unset admits nothing extra: a development
 * server started outside `dev-node.sh` then fails to sign in, where a default
 * would widen the allowlist to whatever is listening on somebody else's port.
 */
function vitePort(): number | null {
  const named = Number(process.env['IC_VITE_PORT'])
  return Number.isInteger(named) && named > 0 && named < 65536 ? named : null
}

export function trustedOrigins(baseURL: string, mode: string): string[] {
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    // **Empty, never permissive.** A base URL nobody can parse is a
    // misconfiguration; answering "trust everything" to one would turn a typo
    // into an open door.
    return []
  }

  const origins = new Set<string>([url.origin])

  if (LOOPBACK.includes(url.hostname as (typeof LOOPBACK)[number])) {
    for (const host of LOOPBACK) {
      origins.add(url.port === '' ? `${url.protocol}//${host}` : `${url.protocol}//${host}:${url.port}`)
    }
    const vite = vitePort()
    if (mode === 'development' && vite !== null) {
      for (const host of LOOPBACK) {
        origins.add(`${url.protocol}//${host}:${String(vite)}`)
      }
    }
  }

  return [...origins]
}
