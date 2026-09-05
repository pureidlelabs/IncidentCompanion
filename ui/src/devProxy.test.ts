import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every root-scoped asset the SPA asks for is proxied by the dev server.
 *
 * **This checks reachability, not existence.** Whether `server/assets/` actually
 * holds the file is the server's to say - the brand
 * asset tests do that, and duplicating it here would be a second copy of a
 * claim about a directory this side cannot see.
 */

const SRC = dirname(fileURLToPath(import.meta.url))
const CONFIG = join(SRC, '..', 'vite.config.ts')

/**
 * A `src=` or `href=` naming an absolute path - the shape that leaves the
 * SPA's base behind.
 */
const ROOT_SCOPED = /(?:src|href)=["'](\/[^"'/][^"']*)["']/g

/** Served by Vite itself under the SPA's own base, so no proxy is involved. */
const OWN_BASE = '/ui/'

function sourcesUnder(dir: string): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      found.push(...sourcesUnder(full))
      continue
    }
    if (!/\.tsx?$/.test(name)) continue
    if (/\.(test|stories)\.tsx?$/.test(name)) continue
    found.push({ path: full.slice(SRC.length + 1), text: readFileSync(full, 'utf8') })
  }
  return found
}

describe('the dev server reaches every root-scoped asset the app draws', () => {
  const config = readFileSync(CONFIG, 'utf8')
  const proxied = [...config.matchAll(/^\s*'(\/[^']+)':\s*proxied,/gm)].map((m) => m[1]!)

  it('finds the proxy table', () => {
    expect(proxied).toContain('/api')
  })

  it('proxies every absolute src= and href= under src/', () => {
    const missing: string[] = []
    const sources = sourcesUnder(SRC)

    // A walk that returned nothing would report every URL as proxied, which is
    // the same answer as everything being right.
    expect(sources.length, 'the walk found no source under src/').toBeGreaterThan(100)

    for (const { path, text } of sources) {
      for (const match of text.matchAll(ROOT_SCOPED)) {
        const url = match[1]!
        if (url.startsWith(OWN_BASE)) continue
        // A prefix entry covers everything under it, which is how `/api` works.
        if (proxied.some((entry) => url === entry || url.startsWith(`${entry}/`))) continue
        missing.push(`${path} asks for ${url}`)
      }
    }
    expect(
      missing,
      'unproxied in dev \u2014 history-fallback answers the SPA index with a 200, ' +
        "so it renders broken and the production build is fine. Add it to vite.config.ts's proxy table",
    ).toEqual([])
  })
})
