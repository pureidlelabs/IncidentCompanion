import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Structural rules about the *shape* of the source tree, not about any one
 * screen. `components/blocks/blocks.test.ts` is the same species scoped to the kit.
 *
 * **Both rules here fire on things a green suite otherwise hides**, which is
 * the only reason a structural test earns its cost: nothing renders wrong, no
 * assertion is violated, and the defect is a relationship between two files.
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
 *
 * **`import type` is excluded, and that is the whole point of the option.** A
 * type import erases at build, so a module reached *only* that way contributes
 * no runtime code - and counting it as a product caller is what let
 * `timelineLayout.ts` keep ~600 lines and 23 dead exports alive behind a
 * single surviving type, invisible to this check on the branch that added it.
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
  return [
    spec,
    `${spec}.ts`,
    `${spec}.tsx`,
    join(spec, 'index.ts'),
    join(spec, 'index.tsx'),
  ]
}

describe('no module is kept alive only by its own test', () => {
  /**
   * **A test can be green because it is pointed at code the product does not
   * call**, and every individual signal reads correct while it is: the name
   * states the right claim, the assertion is real, coverage counts the dead
   * function as covered, and a break-verify against it bites. The wrong line is
   * the import at the top of the test, which is the line nobody reads.
   *
   * Measured on the timeline cascade: inverting the *shipping* ramp so a
   * longer silence drew shorter, which is precisely the defect being fixed,
   * left **1366 of 1366 tests green** - the silence test asserted the
   * property the whole page exists for, and imported an unused twin of the
   * layout that actually drew it.
   *
   * The precondition is two implementations of one answer, which arrives with
   * any rewrite that changes the *shape* of a result rather than its value. The
   * cheap defence is deleting the old one in the commit that stops calling it;
   * this is the backstop for when that does not happen.
   *
   */
  it('every module is imported by something other than its own test', () => {
    // `fixtures/` and `test/` exist to be imported by tests and nothing else,
    // so "no product caller" is their correct state rather than a finding. A
    // module named for a fixture is the same thing filed in a feature
    // directory: `caseSummaryFixture.ts`, `api/sentinel/fixtureSource.ts`.
    const support = [join(SRC, 'fixtures'), join(SRC, 'test')]

    /**
     * **The kit is a library tier, and a library's callers are outside it.**
     * `components/ui/` is published surface: every component owes a
     * `.stories.tsx`, which is its documentation page and its browser-tier
     * test at once, so a kit component whose only importer is its own story is
     * the tier working rather than a dead module.
     *
     * **What this gives up, and what covers it instead.** A kit component
     * nothing ever adopts stops being findable here.
     * `kit-owns-the-primitives.rule.test.ts` refuses one with no story, so an
     * unadopted component is visible; an unadopted *and* undocumented one
     * cannot exist. The check keeps biting everywhere else, the kit's own
     * non-component modules included.
     */
    const kitComponent = (path: string) =>
      dirname(path) === join(SRC, 'components', 'ui') && path.endsWith('.tsx')

    /**
     * **`screens/` is a gallery tier, and Storybook is its consumer.** It holds
     * the app's screens composed out of blocks and components on mock
     * data, so they can be judged whole without running the app, and
     * `screens/screens.rule.test.ts` *requires* every screen to carry a story.
     * A screen whose only importer is its own story is therefore the tier
     * working, not a module kept alive by its test.
     *
     * **Structural rather than an `openFindings` entry, for the reason the kit
     * is.** An open finding is a module awaiting adoption and the staleness
     * check deletes the line when it arrives; these are not awaiting anything,
     * and listing them would mean a new line per screen forever.
     *
     * **What it gives up, and what covers it instead.** A screen nobody ever
     * routes to stops being findable here. `screens.rule.test.ts` fails a
     * screen with no story and refuses one that imports `app/` or a
     * relative path out of the tier, so an unreachable *and* undocumented
     * screen cannot exist -- and the story is a browser-tier test, not a
     * placeholder.
     */
    const screensTier = (path: string) => path.startsWith(join(SRC, 'screens') + '/')

    const isSupport = (path: string) =>
      support.some((dir) => path.startsWith(dir)) || /fixture/i.test(path)

    const all = filesUnder(SRC, isSource)
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
     * **Open findings, not exemptions.** Each of these was found by this check
     * on its first run and is the shape it exists to catch - a module with a
     * test and no product caller. They are listed rather than deleted because
     * deciding each one is its own piece of work, and a check that stays red
     * gets disabled. **Deleting a line here is the fix; adding one needs a
     * reason in the commit.**
     *
     * - `api/specsResidual.ts` - the residual-field rule, tested, uncalled.
     * - a captured line's wire shape - "what one captured line becomes
     *   on the wire", extracted from the component to be testable, and the
     *   component never rewired to it. Same shape as `layoutCascade`: the test
     *   proves the extracted copy while the shipping path goes unchecked.
     */
    const openFindings = [
      'api/specsResidual.ts',
      /**
       * The key times flyout. Its home is the case header, and nothing puts it
       * there: the running app mounts `CaseFrame` through
       * `app/case/CaseFrameContainer`, which passes no `headerEnd`, so the
       * gallery decorator is still the only caller.
       */
      'components/blocks/case-key-times-sheet.tsx',
      /**
       * **Built on the React Aria tier and not yet reached by a container.**
       *
       * These were twins while their ReUI originals stood, and the twin
       * exemption above covered them for exactly that long. The originals went
       * with the ReUI tier, so each is now a finished part with a story, a
       * test and no screen calling it -- which is this check working rather
       * than failing.
       *
       * Each is its own piece of work: a CSV door, a reorder, a Sentinel
       * connection. Deleting them would throw away built behaviour, and wiring
       * them is the remainder of the migration rather than a line in a test.
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
          if (!/export\s+(?:function|const|class|let|var|default|\{)/.test(
            readFileSync(target, 'utf8'),
          )) continue
          const name = relative(SRC, target)
          if (openFindings.includes(name)) continue
          orphans.push(`${relative(SRC, path)} -> ${name}`)
        }
      }
    }

    expect(
      [...new Set(orphans)].sort(),
      'a test imports a module nothing in the app imports: either the module is '
        + 'dead and should be deleted, or the test is aimed at a second '
        + 'implementation while the shipping one goes unchecked',
    ).toEqual([])

    // **The list is checked in the other direction too, or it rots.** An entry
    // whose module has since been wired up or deleted is a permission nobody
    // needs, and the next stale one is indistinguishable from it.
    const stale = openFindings.filter((name) => {
      const target = join(SRC, name)
      return !sources.includes(target) || reachedByProduct.has(target)
    })
    expect(stale, 'these are no longer orphans -- delete them from openFindings')
      .toEqual([])
  })
})

describe('the production manifest carries nothing the app does not import', () => {
  /**
   * **A dependency nothing imports still ships.** The bundler tree-shakes an
   * unused one out of `dist`, so the build stays clean while the manifest,
   * the lockfile and the licence surface all carry it - and this asks the
   * general question rather than one narrowed to a single known offender.
   * Measured once: deleting a batch of unreached registry components left
   * **fourteen** production dependencies with no importer left, most of them
   * kept alive only by the vendored code that had just been removed.
   *
   * **A dynamic import counts.** `cytoscape-fcose` is loaded through
   * `import()` and by nothing else, and an audit that read only `from` clauses
   * reported it dead - so both forms are read here.
   *
   * The exceptions are listed with a reason each, in the shape the
   * anonymous-access allow-list uses: being in this list is a claim somebody
   * made, visible in a diff, rather than a silence.
   */
  const NOT_IMPORTED: readonly (readonly [string, string])[] = [
    ['@fontsource-variable/inter', 'Pulled by `styles/index.css`, which is CSS rather than a module.'],
    ['tw-animate-css', 'Same: an `@import` in `styles/index.css`.'],
    ['@tiptap/pm', "ProseMirror's own packages, resolved through this alias by every @tiptap/* module rather than by our source."],
    ['react-dom', 'Reached as `react-dom/client` and `react-dom/test-utils`, which the package-name scan below does not collapse.'],
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
    for (const path of filesUnder(SRC, (name) => isSource(name) || name.endsWith('.css'))) {
      const text = readFileSync(path, 'utf8')
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
