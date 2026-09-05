import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Structural rules about the *shape* of the source tree, not about any one
 * screen. `components/blocks/blocks.test.ts` is the same species scoped to the kit.
 */

const SRC = dirname(fileURLToPath(import.meta.url))
const UI = join(SRC, '..')

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'generated') continue
      found.push(...filesUnder(full, keep))
      continue
    }
    if (keep(name)) found.push(full)
  }
  return found
}

const isSource = (name: string) => /\.tsx?$/.test(name) && !name.endsWith('.d.ts')
const isTest = (name: string) => /\.(test|stories)\.tsx?$/.test(name)

/**
 * Every `from '...'` and `import('...')` a file names, relative specifiers only.
 */
function importsOf(path: string, { valuesOnly = false } = {}): string[] {
  const text = readFileSync(path, 'utf8')
  const found: string[] = []
  // The clause may span lines -- most of this codebase's imports do -- so the
  // middle is "characters an import clause can hold", which stops at the `;`
  // or quote that would end the statement. A single-line `[^;\n]*?` missed
  // every multi-line import and reported four live modules as unreachable.
  for (const m of text.matchAll(
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[A-Za-z0-9_$,{}\s*]*?\bfrom\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g,
  )) {
    if (valuesOnly && m[1]) continue
    const spec = m[2] ?? m[3]
    if (!spec) continue
    if (spec.startsWith('.')) found.push(resolve(dirname(path), spec))
    else if (spec.startsWith('@/')) found.push(resolve(SRC, spec.slice(2)))
  }
  return found
}

/** A resolved specifier back to the file it names, extension and index forms. */
function targetsOf(spec: string): string[] {
  return [spec, `${spec}.ts`, `${spec}.tsx`, join(spec, 'index.ts'), join(spec, 'index.tsx')]
}

describe('no module is kept alive only by its own test', () => {
  /**
   * **A test can be green because it is pointed at code the product does not
   * call**, and every individual signal reads correct while it is: the name
   * states the right claim, the assertion is real, coverage counts the dead
   * function as covered, and a break-verify against it bites.
   */
  it('every module is imported by something other than its own test', () => {
    // `fixtures/` and `test/` exist to be imported by tests and nothing else,
    // so "no product caller" is their correct state rather than a finding. A
    // module named for a fixture is the same thing filed in a feature
    // directory: `caseSummaryFixture.ts`, `api/sentinel/fixtureSource.ts`.
    const support = [join(SRC, 'fixtures'), join(SRC, 'test')]

    /**
     * **The kit is a library tier, and a library's callers are outside it.**
     */
    const kitComponent = (path: string) =>
      dirname(path) === join(SRC, 'components', 'ui') && path.endsWith('.tsx')

    /**
     * **`screens/` is a gallery tier, and Storybook is its consumer.**
     */
    const screensTier = (path: string) => path.startsWith(join(SRC, 'screens') + '/')

    const isSupport = (path: string) =>
      support.some((dir) => path.startsWith(dir)) || /fixture/i.test(path)

    const all = filesUnder(SRC, isSource)

    // A walk that returned nothing leaves every set below empty, and "no module
    // is unimported" is then true of nothing.
    expect(all.length, 'the walk found no source under src/').toBeGreaterThan(300)

    const sources = all.filter((path) => !isTest(path) && !isSupport(path))
    const tests = all.filter(isTest)

    // What each *non-test* file imports, as a set of resolved paths.
    const reachedByProduct = new Set<string>()
    for (const path of sources) {
      // Values only: a module the app reaches solely through `import type`
      // ships nothing, and counting it as reached hides a whole dead module
      // behind one surviving type.
      for (const spec of importsOf(path, { valuesOnly: true })) {
        for (const target of targetsOf(spec)) reachedByProduct.add(target)
      }
    }

    /**
     * **Open findings, not exemptions.**
     */
    const openFindings = [
      'api/specsResidual.ts',
      /**
       * **Built on the React Aria tier and not yet reached by a container.**
       */
      'api/collectionCsv.ts',
      'api/complianceWire.ts',
      'api/refOptions.ts',
      'api/useEntryReorder.ts',
      'api/usePendingEntryIds.ts',
      'api/sentinel/connectionConfig.ts',
      'api/sentinel/source.ts',
      'components/blocks/export-csv-button.tsx',
      'components/blocks/import-csv-control.tsx',
      'components/blocks/pane-head.tsx',
      'components/blocks/prose-shortcuts.tsx',
      'lib/whenAgo.ts',
    ]

    const orphans: string[] = []
    for (const path of tests) {
      for (const spec of importsOf(path)) {
        for (const target of targetsOf(spec)) {
          if (!sources.includes(target)) continue
          if (reachedByProduct.has(target)) continue
          // Exempt as a *target* only. Excluding the kit from `sources`
          // instead would drop its own imports out of `reachedByProduct`, and
          // `api/backendHealth.ts` - which `backend-banner.tsx` genuinely
          // calls - reported as an orphan.
          if (kitComponent(target)) continue
          if (screensTier(target)) continue
          // A module that exports only types is *supposed* to be reached by
          // `import type` alone -- that is what it is for, and it ships no
          // runtime code to be dead. `graphEntry.ts` is the case.
          if (
            !/export\s+(?:function|const|class|let|var|default|\{)/.test(
              readFileSync(target, 'utf8'),
            )
          )
            continue
          const name = relative(SRC, target)
          if (openFindings.includes(name)) continue
          orphans.push(`${relative(SRC, path)} -> ${name}`)
        }
      }
    }

    expect(
      [...new Set(orphans)].sort(),
      'a test imports a module nothing in the app imports: either the module is ' +
        'dead and should be deleted, or the test is aimed at a second ' +
        'implementation while the shipping one goes unchecked',
    ).toEqual([])

    // **The list is checked in the other direction too, or it rots.** An entry
    // whose module has since been wired up or deleted is a permission nobody
    // needs, and the next stale one is indistinguishable from it.
    const stale = openFindings.filter((name) => {
      const target = join(SRC, name)
      return !sources.includes(target) || reachedByProduct.has(target)
    })
    expect(stale, 'these are no longer orphans -- delete them from openFindings').toEqual([])
  })
})

describe('the production manifest carries nothing the app does not import', () => {
  /**
   * **A dependency nothing imports still ships.**
   */
  const NOT_IMPORTED: readonly (readonly [string, string])[] = [
    [
      '@fontsource-variable/inter',
      'Pulled by `styles/index.css`, which is CSS rather than a module.',
    ],
    ['tw-animate-css', 'Same: an `@import` in `styles/index.css`.'],
    [
      '@tiptap/pm',
      "ProseMirror's own packages, resolved through this alias by every @tiptap/* module rather than by our source.",
    ],
    [
      'react-dom',
      'Reached as `react-dom/client` and `react-dom/test-utils`, which the package-name scan below does not collapse.',
    ],
    [
      'zod',
      'Imported by the `server/src/domain` modules the `@contract` alias bundles into the browser, never by `ui/src` itself. `bundled-deps.rule.test.ts` is what requires the declaration.',
    ],
  ]

  it('has an importer for every production dependency', () => {
    const manifest = JSON.parse(readFileSync(join(UI, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const excused = new Set(NOT_IMPORTED.map(([name]) => name))

    const packageOf = (spec: string) => {
      const parts = spec.split('/')
      return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
    }
    const imported = new Set<string>()
    const walked = filesUnder(SRC, (name) => isSource(name) || name.endsWith('.css'))
    expect(walked.length, 'the walk found no source to read imports from').toBeGreaterThan(300)

    /**
     * Comments stripped before the scan, because the scan is a text match.
     * A docstring quoting `from 'zod'` -- including one explaining that the
     * import is refused -- registers the package as imported and the orphan it
     * names goes unreported.
     */
    const uncommented = (text: string, source: boolean) => {
      const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, ' ')
      return source ? noBlocks.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ') : noBlocks
    }

    for (const path of walked) {
      const text = uncommented(readFileSync(path, 'utf8'), !path.endsWith('.css'))
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'".][^'"]*)['"]/g)) {
        imported.add(packageOf(m[1]!))
      }
      for (const m of text.matchAll(/@import\s*['"]([^'".][^'"]*)['"]/g)) {
        imported.add(packageOf(m[1]!))
      }
    }

    const orphaned = Object.keys(manifest.dependencies ?? {})
      .filter((name) => !imported.has(name))
      .filter((name) => !excused.has(name))

    expect(
      orphaned.sort(),
      'these ship, and are in the lockfile and the licence surface, with no importer',
    ).toEqual([])
  })

  it('excuses nothing that is imported after all', () => {
    // An excuse that stopped being true is a hole in the check above, and it
    // reads exactly like a dependency that is legitimately unreachable.
    const manifest = JSON.parse(readFileSync(join(UI, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const stale = NOT_IMPORTED.map(([name]) => name).filter(
      (name) => !(name in (manifest.dependencies ?? {})),
    )
    expect(stale, 'excused, and no longer a dependency at all').toEqual([])
  })
})
