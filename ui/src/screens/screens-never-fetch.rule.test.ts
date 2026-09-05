import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A screen never performs I/O, so Storybook needs no server to draw one.**
 *
 * That is what the tier is for: the interface is designed in Storybook against
 * fixtures, and the app is what afterwards discovers whether the design broke
 * anything. A screen that fetches takes the stack hostage -- Storybook then
 * needs Postgres, Redis and a signed-in session to render a page, and the
 * design loop this tier exists for is gone.
 *
 * **`screens.rule.test.ts` permits `@/api/` and cannot see this.** That
 * permission is for the wire *types* -- `@/api/model`, `@/api/specs` -- and it
 * reads as a licence for a question it was never asked. `@/api/client` sits
 * under the same prefix and exports `signIn`, so a screen calling it on submit
 * fires a real credential POST out of the gallery while the rule stays green.
 *
 * **Green the day it was written.** Measured over the tier: every existing
 * `@/api/client` import is `ApiError`, and `@/api/case` is imported
 * `import type`. The property already held by accident; this is what makes it
 * hold on purpose. A ratchet, not an audit.
 *
 * ## What it cannot see, stated rather than implied
 *
 * A screen *handed* a function that fetches, through a prop, is invisible here
 * and is correct -- that is exactly how a container serves one. This checks
 * where a screen reaches, never what it is given.
 *
 * It also cannot see a dynamic `import()` assembled from a variable. That is
 * undecidable from source, and a rule claiming to catch it would be lying
 * about its own reach.
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))

/** Import and re-export specifiers, in either quote. Anchored like the sibling rule. */
const IMPORT = /(?:\bfrom|\bimport\s*\()\s*['"]([^'"]+)['"]/g

/** Prose may name a module the code may not import -- this file's own docstrings do. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Modules that reach the network.
 *
 * Named rather than matched by prefix: `@/api/` holds both the wire types
 * every screen legitimately needs and the client that must never appear here,
 * so the distinction is which module, not which prefix.
 */
const FETCHING = ['@/api/client', '@/api/case', '@/api/useEntry', '@/api/useBulk', '@/api/session']

/**
 * What may still be taken from one of those, by name.
 *
 * **`ApiError` is a shape, not a call.** A screen rendering a refusal has to
 * name the error class it is handed, and taking it makes no request.
 */
const HARMLESS = new Set(['ApiError'])

/** Every source file in the tier, `.ts` included -- a shared projection is one too. */
const FILES = glob
  .sync(`${HERE}/**/*.{ts,tsx}`)
  .filter((path) => !/\.(test|stories)\.tsx?$/.test(path))

interface Offence {
  file: string
  specifier: string
  what: string
}

/** The named bindings of one import statement, or null when it is `import type`. */
function bindingsOf(text: string, specifier: string): string[] | null {
  const at = text.indexOf(`'${specifier}'`)
  if (at === -1) return []
  const opens = text.lastIndexOf('import', at)
  if (opens === -1) return []
  const statement = text.slice(opens, at)
  if (/^import\s+type\b/.test(statement)) return null
  return [...statement.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)]
    .map((match) => match[1] ?? '')
    .filter((name) => name !== 'import' && name !== 'from' && name !== 'type')
}

describe('a screen never reaches the network', () => {
  it('has files to judge', () => {
    // The sibling rule passes on an empty directory by design. This one would
    // then be vacuous, and a vacuous rule reads exactly like a kept promise.
    expect(FILES.length).toBeGreaterThan(20)
  })

  it('imports no module that performs a request', () => {
    const offences: Offence[] = []

    for (const path of FILES) {
      const text = withoutComments(readFileSync(path, 'utf8'))
      for (const [, specifier = ''] of text.matchAll(IMPORT)) {
        const hit = FETCHING.find((mod) => specifier === mod || specifier.startsWith(`${mod}/`))
        if (hit === undefined) continue

        const bindings = bindingsOf(text, specifier)
        if (bindings === null) continue // `import type` is erased before it runs

        const live = bindings.filter((name) => !HARMLESS.has(name))
        if (live.length > 0) {
          offences.push({ file: relative(HERE, path), specifier, what: live.join(', ') })
        }
      }
    }

    expect(
      offences,
      'a screen taking one of these can fetch, and Storybook then needs a stack to draw it -- ' +
        'hand it in from a container instead, the way ui/src/app/auth does',
    ).toEqual([])
  })

  it('calls no request of its own', () => {
    const offenders = FILES.filter((path) => {
      const text = withoutComments(readFileSync(path, 'utf8'))
      return /\b(?:fetch|XMLHttpRequest|EventSource|WebSocket)\s*\(/.test(text)
    }).map((path) => relative(HERE, path))

    expect(
      offenders,
      'a screen reaching the network directly is the same defect one layer lower',
    ).toEqual([])
  })
})
