/**
 * Every `data-testid` a browser spec asks for is one the client can render.
 *
 * **Nothing else can catch this.** The browser tier runs in no CI job (#89), so
 * these fail where nobody looks; a typecheck cannot see inside a string; and the
 * client tier never loads a spec. This is static, cheap, and runs in a tier that
 * does run.
 *
 * **What it cannot see:** an id the client renders only through a prop a caller
 * passes from outside `ui/src`, and one assembled from parts. Both want more
 * parsing than the defect is worth.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E = resolve(HERE, '../e2e')
const CLIENT = resolve(HERE, '../../ui/src')

const ASKED = /getByTestId\(\s*['"]([^'"]+)['"]|\[data-testid=["']([^"']+)["']\]/g
const LITERAL = /data-testid=["']([^"']+)["']/g
const PROP = /[Tt]est[Ii]d\s*[=:]\s*["']([^"']+)["']/g
const PREFIX = /data-testid=\{`([^`$]*)\$\{/g

/**
 * Asked for by a spec and rendered by nothing.
 */
const RENDERED_BY_NOTHING: readonly string[] = [
  'accounts-new',
  'case-activity',
  'case-rail',
  'command-palette',
  'frame-oracle-play-selftest',
  'header-search',
  'header-search-row',
  'password-reveal',
]

const asked = (): Map<string, string[]> => {
  const found = new Map<string, string[]>()
  for (const file of globSync(['**/*.spec.ts', 'support/**/*.ts'], { cwd: E2E, absolute: true })) {
    for (const match of readFileSync(file, 'utf8').matchAll(ASKED)) {
      const id = match[1] ?? match[2] ?? ''
      // Built from a variable: one string here, many at run time.
      if (id === '' || id.includes('${')) continue
      found.set(id, [...(found.get(id) ?? []), relative(E2E, file)])
    }
  }
  return found
}

const renders = (): { literals: Set<string>; prefixes: Set<string> } => {
  const literals = new Set<string>()
  const prefixes = new Set<string>()
  for (const file of globSync(['**/*.{ts,tsx}'], { cwd: CLIENT, absolute: true })) {
    const text = readFileSync(file, 'utf8')
    for (const one of text.matchAll(LITERAL)) literals.add(one[1]!)
    for (const one of text.matchAll(PROP)) literals.add(one[1]!)
    for (const one of text.matchAll(PREFIX)) if (one[1]) prefixes.add(one[1])
  }
  return { literals, prefixes }
}

const ASKS = asked()
const CAN = renders()

const renderable = (id: string): boolean =>
  CAN.literals.has(id) || [...CAN.prefixes].some((prefix) => id.startsWith(prefix))

describe('a testid a browser spec asks for', () => {
  it('reads both trees, so an absence below is an absence', () => {
    expect(ASKS.size, 'no spec asks for a testid, so this rule sweeps nothing').toBeGreaterThan(10)
    expect(
      CAN.literals.size,
      'the client renders no testid at all, which would fail every case below for the wrong reason',
    ).toBeGreaterThan(30)
  })

  it.each([...ASKS.keys()].filter((id) => !RENDERED_BY_NOTHING.includes(id)).sort())(
    '%s is one the client can render',
    (id) => {
      expect(
        renderable(id),
        `nothing in ui/src renders data-testid="${id}", so ${(ASKS.get(id) ?? []).join(', ')} ` +
          'waits out its timeout and reports the screen as broken',
      ).toBe(true)
    },
  )

  it.each(RENDERED_BY_NOTHING)('%s is still rendered by nothing', (id) => {
    expect(
      renderable(id),
      `${id} resolves now, so take it out of RENDERED_BY_NOTHING -- an exemption nobody removes ` +
        'is how a rule stops meaning anything',
    ).toBe(false)
  })
})
