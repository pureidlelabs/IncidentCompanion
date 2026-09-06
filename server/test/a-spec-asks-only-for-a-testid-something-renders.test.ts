/**
 * Every `data-testid` a browser spec asks for is one the client can render.
 *
 * **A spec querying an attribute nothing renders cannot pass, and fails in the
 * least useful way available**: it waits out its timeout, reports `element(s)
 * not found`, and reads as the screen being broken -- so the reader goes to the
 * component, which opens perfectly, rather than to the selector.
 *
 * **Nothing else can catch this.** No CI job runs the behaviour specs --
 * `server/e2e/playwright.config.ts` appears nowhere in `ci.yml`, and the job that
 * installs a browser drives Storybook -- so they fail where nobody looks; a
 * typecheck cannot see inside a string; and the client tier never loads a spec.
 * This is static, cheap, and runs in a tier that does run.
 *
 * ## What counts as rendered, and why each spelling had to be added
 *
 * A literal `data-testid="x"`; a templated one, matched by its prefix, since
 * `data-testid={`shortcut-${id}`}` can produce `shortcut-open-case`; and one
 * passed as a prop -- `triggerTestId="rail-trigger"` is how `entities.stories`
 * hands one down, and reading only the attribute reported three live ids as
 * missing.
 *
 * A name the spec builds from a variable is skipped rather than guessed at:
 * `[data-testid="picker-row-${slug}"]` is one string to this reader and cannot
 * be resolved without running the spec.
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
 *
 * Each fails its own spec the moment it runs, and each needs somebody to give
 * that screen a real handle -- work that needs the client rather than a sweep.
 * The case below fails when one starts resolving, so the list cannot outlive
 * the debt it records. -> #270
 *
 * `frame-oracle-play-selftest` is here for a different reason: the spec writes
 * the story that renders it into `ui/src` at run time and removes it again, so
 * it is absent exactly when this test reads and present exactly when it matters.
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
