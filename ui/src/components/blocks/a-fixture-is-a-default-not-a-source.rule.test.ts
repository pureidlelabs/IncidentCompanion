import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

/**
 * **A part holds no example content at all -- not as a source, and not as a
 * default.**
 *
 * **A default is the same leak arriving quietly**, which is what this rule used
 * to permit and the specification does not. Its scenario is *a part is given
 * nothing -- then it shows nothing rather than the example*.
 * -> `openspec/specs/interface/spec.md`, #237
 *
 * ## What it reads
 *
 * Every block and screen that imports a collection fixture. Any mention at all
 * outside the import line is refused, a default parameter included. A `const`
 * derived from one at module scope is the same defect wearing a different hat.
 *
 * ## What it cannot see
 *
 * A prop that exists and is ignored: `HealthPane({ serving })` that went on
 * reading real data from somewhere else would pass. That is what
 * `panes-draw-what-they-are-given.test.tsx` is for -- this test makes the seam
 * exist, and that one makes it carry.
 */

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const SRC = resolve(HERE, '../..')

/**
 * Where a fixture lives, in **both** spellings of the same module.
 *
 * A block says `./picker-rows` and a screen says
 * `@/components/blocks/picker-rows`, so matching only the first leaves every
 * `picker-*` screen unwatched -- the half of the tier most likely to grow this
 * defect, since a screen is where a container's prop would arrive.
 *
 * `@/fixtures` is deliberately absent: `collectionFixtures()` reads
 * `picker-rows.ts` alone, so no identifier from there would survive the filter
 * below, and a pattern half of which is dead reads as coverage.
 */
const FIXTURE_MODULES = /from '(\.\/picker-rows|@\/components\/blocks\/picker-rows)'/

const FILES = globSync('{components/blocks,screens}/**/*.tsx', { cwd: SRC, absolute: true })
  .filter((path) => !/\.(test|stories)\.tsx$/.test(path))

/**
 * The fixtures that stand for an install's own data, which is the set this
 * rule is about.
 *
 * **A collection, not a scalar.** `REDIS_DOWN_NOTE` is a sentence and
 * `PICKER_UPTIME` is a label -- copy, correctly read straight out of the
 * module, and flagging them would fire on prose. A `readonly Row[]` is a list
 * of things this install has, and no two installs have the same one.
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
   * file green. So the sweep is asserted before it is iterated: a renamed
   * directory under `blocks/` or `screens/` would otherwise take the whole rule
   * with it and look exactly like everything being in order.
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

      offenders.push(fixture)
    }

    expect(
      offenders,
      `${relative(SRC, path)} holds ${offenders.join(', ')}. A part that reads a fixture draws ` +
        `the same install whatever a container hands it, and one that defaults to a fixture ` +
        `does the same the moment a container passes nothing -- which is what a container whose ` +
        `data has not arrived does. The example belongs in the story.`,
    ).toEqual([])
  })
})
