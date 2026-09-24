import { expect } from 'vitest'

/**
 * The sources one directive of a content policy names, in order, failing the
 * test on any source that admits every host: a wildcard, or a scheme on its
 * own such as `wss:`.
 */
export function sourcesOf(csp: string, directive: string): string[] {
  const found = csp.split(';').map((one) => one.trim().split(/\s+/))
  const sources = found.find(([name]) => name === directive)?.slice(1) ?? []
  for (const source of sources) {
    expect(source, `${directive} admits every host under ${source}`).not.toMatch(
      /^[a-z][a-z0-9+.-]*:$|\*/,
    )
  }
  return sources
}
