import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A fixture may be the default of a prop. It may not be what a surface
 * reads.**
 *
 * ## What it cannot see
 */

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const SRC = resolve(HERE, '../..')

/**
 * Where a fixture lives, in **both** spellings of the same module.
 */
const FIXTURE_MODULES = /from '(\.\/picker-rows|@\/components\/blocks\/picker-rows)'/

const FILES = glob
  .sync(`${SRC}/{components/blocks,screens}/**/*.tsx`)
  .filter((path) => !/\.(test|stories)\.tsx$/.test(path))

/**
 * The fixtures that stand for an install's own data, which is the set this
 * rule is about.
 */
function collectionFixtures(): ReadonlySet<string> {
  const rows = readFileSync(resolve(HERE, 'picker-rows.ts'), 'utf8')
  const found = new Set<string>()
  for (const one of rows.matchAll(/export const ([A-Z][A-Z0-9_]*)[^=\n]*=\s*\[/g)) {
    if (one[1]) found.add(one[1])
  }
  return found
}

const COLLECTIONS = collectionFixtures()

/** The identifiers a file imports from a fixture module. */
function fixturesImported(text: string): string[] {
  const names: string[] = []
  const imports = text.matchAll(/import\s+\{([^}]*)\}\s+from\s+'([^']+)'/g)
  for (const one of imports) {
    if (!FIXTURE_MODULES.test(`from '${one[2] ?? ''}'`)) continue
    for (const raw of (one[1] ?? '').split(',')) {
      const name = raw.trim().replace(/^type\s+/, '')
      // A type is not a value and cannot be read as data.
      if (name && !/^type\s/.test(raw.trim()) && /^[A-Z_][A-Z0-9_]*$/.test(name)) {
        names.push(name)
      }
    }
  }
  return names
}

describe('a fixture is a default, never a source', () => {
  /**
   * **An `it.each` over nothing is a file that passes having run no case**, and
   * pytest's *empty parameter set* has no equivalent here -- vitest reports the
   * file green.
   */
  it('sweeps the tiers this rule is about', () => {
    expect(FILES.length, 'the glob matched no component at all').toBeGreaterThan(50)
  })

  it.each(FILES.map((path) => [relative(SRC, path), path]))('%s', (_name, path) => {
    const text = readFileSync(path, 'utf8')
    const offenders: string[] = []

    for (const fixture of fixturesImported(text).filter((one) => COLLECTIONS.has(one))) {
      // Every mention outside the import line.
      const body = text.replace(/import[\s\S]*?from\s+'[^']+'\n/g, '')
      const mentions = [...body.matchAll(new RegExp(`\\b${fixture}\\b`, 'g'))]
      if (mentions.length === 0) continue

      // A default in a destructuring parameter: `name = FIXTURE`.
      const asDefault = [...body.matchAll(new RegExp(`[\\w\\]]\\s*=\\s*${fixture}\\b`, 'g'))].length
      if (asDefault < mentions.length) {
        offenders.push(fixture)
      }
    }

    expect(
      offenders,
      `${relative(SRC, path)} reads ${offenders.join(', ')} rather than taking it as a prop ` +
        `whose default it is. A surface that reads a fixture draws the same install whatever ` +
        `a container hands it, and no story can tell.`,
    ).toEqual([])
  })
})
