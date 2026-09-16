import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **Better Auth's own names stay behind `authClient`.**
 *
 * `client.ts` wraps `signIn` and `signOut` to fill and clear the identity
 * store, and `useSession.ts` wraps `useSession` to read that store rather than
 * re-probe the server. A second export of one of those names off `authClient`
 * typechecks at every call site and takes the unwrapped call, so the store
 * goes unwritten while the session is live -- and which one a caller gets is
 * decided by the module its import names, which nothing checks.
 */
const API = dirname(fileURLToPath(import.meta.url))

/** The names a module exports, by declaration, destructure or export list. */
function exportedNames(source: string): string[] {
  const found: string[] = []
  for (const m of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    found.push(m[1] ?? '')
  }
  // `export const { a, b } = x` and `export { a, b as c }`, which is how a
  // re-export arrives without ever naming a declaration.
  for (const m of source.matchAll(/^export\s+(?:const|let|var)?\s*\{([^}]*)\}/gm)) {
    for (const one of (m[1] ?? '').split(',')) {
      const name = one.split(/\bas\b|:/).pop()?.trim() ?? ''
      if (name && name !== 'type') found.push(name)
    }
  }
  return found.filter(Boolean)
}

const namesOf = (file: string): string[] =>
  exportedNames(readFileSync(join(API, file), 'utf8'))

describe('the auth client', () => {
  /**
   * The rule is worth nothing if the extraction stopped matching the shape it
   * is written against, and the offending line is the one it exists to keep
   * deleted -- so the shape is asserted here rather than against a file.
   */
  it('reads the destructured re-export it refuses', () => {
    expect(exportedNames('export const { signIn, signOut, useSession } = authClient')).toEqual([
      'signIn',
      'signOut',
      'useSession',
    ])
  })

  it('reads the wrappers it is written about', () => {
    expect(namesOf('client.ts')).toEqual(expect.arrayContaining(['signIn', 'signOut']))
    expect(namesOf('useSession.ts')).toContain('useSession')
  })

  it('exports no name this tier already wraps', () => {
    const wrapped = new Set([...namesOf('client.ts'), ...namesOf('useSession.ts')])
    expect(
      namesOf('authClient.ts').filter((one) => wrapped.has(one)),
      'an import from the wrong module typechecks and takes the unwrapped call. ' +
        'Reach these through `authClient.<name>` instead',
    ).toEqual([])
  })
})
