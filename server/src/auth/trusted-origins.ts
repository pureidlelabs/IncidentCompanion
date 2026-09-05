/**
 * Which origins may drive this server, given the base URL and the run mode.
 */

/** The three ways a browser writes "this machine". */
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'] as const

/**
 * The port Vite serves the app from while developing, or null.
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
