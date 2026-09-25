import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * What the browser bundles by reaching through a door it may value-import.
 *
 * **The stronger rule this sits under is no longer true of every module.**
 * `vocabularies.lists.test.ts` holds the `.lists` modules to importing
 * *nothing*, so the client could value-import a vocabulary without dragging
 * zod in behind it. That was the whole design: schemas were server-only, and
 * `ui/eslint.config.js` refused a value import with "The client owns no
 * schemas."
 *
 * The client owns none still - it imports these rather than declaring any -
 * but it now *runs* them, so that a draft is refused by the field that is
 * wrong instead of by a save that fails. zod is in the bundle deliberately.
 *
 * **So the property is no longer "imports nothing" but "imports nothing a
 * browser cannot run",** and that is weaker in a way worth naming: it cannot
 * be satisfied by inspection of one file. A schema three imports away that
 * reaches for `node:crypto` or a Drizzle table breaks the client build, and
 * the build is the only other thing that would say so - after the fact, in a
 * message about a polyfill.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The packages the closure may reach.
 *
 * An entry here is a real decision - it is what the browser carries to open
 * these doors - so the list is written out rather than derived from what
 * happens to be installed.
 */
const ALLOWED_PACKAGES = new Set(['zod', 'yjs'])

/** A `.lists` module, which is a source file rather than its test. */
const isListModule = (name: string) => name.endsWith('.lists.ts') && !name.endsWith('.test.ts')

/**
 * Every door the client value-imports through, which is what `ui/eslint.config.js`
 * permits by name.
 *
 * **A door added there and not here is the whole failure mode.** The lint stops
 * refusing the import and nothing walks what it drags in, so the check reads as
 * covering a surface it has never opened.
 */
const ENTRIES = [
  'analyst-account.ts',
  'collections.ts',
  'identity.ts',
  'indicator-shape.ts',
  'killchain.ts',
  'malware-shape.ts',
  'prose-authoring.ts',
  'prose-fields.ts',
  /**
   * **Every `.lists` module the client value-imports, named one at a time.**
   * `ui/eslint.config.js` permits them by the glob `!@contract/*.lists`, and a
   * glob cannot be walked -- so the closure check reaches them only by being
   * told. They were leaves until `indicators.lists.ts` needed three of its
   * siblings, which is what ended the shortcut the sibling test describes.
   */
  'colours.lists.ts',
  'hashes.lists.ts',
  'indicators.lists.ts',
  'invisible.lists.ts',
  'naming.lists.ts',
  'scopes.lists.ts',
  'spreadsheet.lists.ts',
  'tlp.lists.ts',
  'vocabularies.lists.ts',
]

function importsOf(source: string): string[] {
  const specs: string[] = []
  // `import x from 'y'`, `export { x } from 'y'`, and `export * from 'y'` -
  // the last is the one a naive check misses, and it is already the mutation
  // `vocabularies.lists.test.ts` records as having slipped past.
  for (const match of source.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)) {
    specs.push(match[1]!)
  }
  // A bare `import 'y'` binds no name and still runs.
  for (const match of source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specs.push(match[1]!)
  return specs
}

function closure(): { files: string[]; packages: string[] } {
  const files = new Set<string>()
  const packages = new Set<string>()

  const visit = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) {
        packages.add(spec)
        continue
      }
      // NodeNext spells a relative import with the `.js` the emitted file
      // will have; the source beside it is `.ts`.
      const base = resolve(dirname(file), spec.replace(/\.js$/, ''))
      const found = [`${base}.ts`, `${base}/index.ts`].find((one) => existsSync(one))
      // An unresolvable relative import is a finding, not something to skip:
      // it would be a file this walk never opened.
      expect(found, `${relative(HERE, file)} imports ${spec}, which resolves to no file`).toBeTruthy()
      visit(found!)
    }
  }

  for (const entry of ENTRIES) visit(resolve(HERE, entry))
  return { files: [...files], packages: [...packages] }
}

describe('what the client bundles to validate a draft', () => {
  it('reaches no package beyond the ones the browser is meant to carry', () => {
    const { packages } = closure()
    expect(packages.sort()).toEqual([...ALLOWED_PACKAGES].sort())
  })

  /**
   * **A node builtin is the specific way this breaks**, and it breaks at
   * bundle time with a message about a polyfill rather than about the import
   * that caused it. Named separately from the check above so the failure says
   * which file.
   */
  it('reaches no node builtin', () => {
    for (const file of closure().files) {
      const builtins = importsOf(readFileSync(file, 'utf8')).filter((one) => one.startsWith('node:'))
      expect(builtins, `${relative(HERE, file)} imports a node builtin`).toEqual([])
    }
  })

  /**
   * **The walk found the tree rather than reporting an empty set clean.** A
   * regex that stopped matching, or an entry that was renamed, passes both
   * assertions above while covering nothing.
   */
  it('walked the doors it is about', () => {
    const { files } = closure()
    const names = files.map((one) => relative(HERE, one))
    expect(names).toContain('entities/network-indicator.ts')
    expect(names).toContain('vocabularies.ts')
    expect(names).toContain('field-spec.ts')
    expect(files.length).toBeGreaterThan(10)
  })

  /** Every door the lint names is walked, so neither list can grow alone. */
  it('starts from every entry the client is allowed to value-import', () => {
    const config = readFileSync(resolve(HERE, '../../../ui/eslint.config.js'), 'utf8')
    // **`*` is in the character class, and leaving it out was the whole gap.**
    // The glob never matched, so the filter that claimed to set it aside was
    // dead and this test compared four written-out doors against four.
    const permitted = [...config.matchAll(/'!@contract\/([\w.*-]+)'/g)].map((match) => match[1]!)

    /**
     * **The glob is expanded against the directory, not excused.** `*.lists`
     * used to stand for the modules that import nothing, which made walking
     * them unnecessary; `indicators.lists.ts` imports three siblings, so the
     * glob now covers doors whose closure has to be walked like any other.
     * Expanding it here is what stops a new `.lists` module being reachable
     * from the browser and walked by nothing.
     */
    const doors = permitted.flatMap((one) =>
      one === '*.lists' ? readdirSync(HERE).filter(isListModule).map((name) => name.slice(0, -3)) : [one],
    )

    expect(doors.map((one) => `${one}.ts`).sort()).toEqual([...ENTRIES].sort())
  })
})
