import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

/**
 * **Nothing outside the kit imports `react-aria-components`.**
 *
 * The kit is `components/ui/`: React Aria supplies behaviour, the app's tokens
 * supply every colour and measure. A screen, block or layout that needs
 * something the kit does not have gets it added to the kit, with its stories
 * beside it - never a raw primitive at the call site.
 *
 * **The reason is measured, not stylistic.** A primitive reached for directly
 * is a component nobody documented, nobody gave states to and nobody can find,
 * which is how a second `Field` comes to exist beside the one everything
 * imports -- neither aware of the other, and found by somebody reading two
 * screens side by side rather than by anything here.
 *
 * **A ratchet, not an audit.** It was green the day it was written: only
 * `lib/locale.ts` sat outside, and that is the kit's own locale helper rather
 * than a screen. So this cannot find a bypass that predates it - it stops the
 * next one.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', '..')

/**
 * The kit itself, plus the one file outside it that legitimately reaches for
 * React Aria: `lib/locale.ts` re-exports `useFilter` and `useLocale` for the
 * app to filter and sort with, and is kit code that happens to live in `lib/`
 * because it exports hooks rather than components.
 */
const ALLOWED = [/^components\/ui\//, /^lib\/locale\.ts$/]

/**
 * The specifier alone, not the `import` keyword in front of it. An earlier
 * form was `/^\s*(?:import|export)[^\n]*from .../m`, which cannot cross a
 * newline - and a multi-line import is the normal shape in this tree, so it
 * missed `popover.tsx` and every one of its neighbours. Break-verifying with a
 * one-line import went red and certified nothing.
 */
const IMPORTS_RAC = /\bfrom\s*['"]react-aria-components(?:\/[^'"]*)?['"]/

describe('the kit owns the primitives', () => {
  const files = globSync('**/*.{ts,tsx}', { cwd: SRC })
    .map((rel) => rel.split('\\').join('/'))
    // **A story is exempt only inside the kit**, where importing React Aria
    // raw is what the file is for. Excluding every story anywhere left the
    // whole gallery tier free to import a primitive directly - and a screen is
    // only ever rendered through a story, so that was the tier the rule most
    // needed to reach.
    .filter(
      (rel) =>
        !/\.test\.tsx?$/.test(rel) &&
        !(/\.stories\.tsx?$/.test(rel) && rel.startsWith('components/ui/')),
    )

  it('finds source to read', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('is the only thing importing react-aria-components', () => {
    const outside = files
      .filter((rel) => !ALLOWED.some((one) => one.test(rel)))
      .filter((rel) => IMPORTS_RAC.test(readFileSync(join(SRC, rel), 'utf8')))
      .sort()

    expect(
      outside,
      'a screen reaching past the kit for a primitive. Add the component to '
        + 'components/ui/ with its .stories.tsx, and import that instead.',
    ).toEqual([])
  })

  /**
   * The guard on the guard: `ALLOWED` is two regexes, and a mistake in either
   * would silently excuse the whole tree rather than two paths.
   */
  it('excuses only the kit and the locale helper', () => {
    const excused = files.filter((rel) => ALLOWED.some((one) => one.test(rel)))
    const strays = excused.filter((rel) => !rel.startsWith('components/ui/') && rel !== 'lib/locale.ts')
    expect(strays, 'ALLOWED is matching more than it names').toEqual([])
    expect(excused.length).toBeLessThan(files.length / 2)
  })

  /**
   * Every kit component owes a documentation page, which is what makes
   * "add it to the kit" a real instruction rather than a place to put a file.
   * The page is generated from the stories, so a component without one is
   * undiscoverable and the next screen writes its own.
   */
  it('gives every kit component a stories file', () => {
    const kit = globSync('*.tsx', { cwd: join(SRC, 'components', 'ui') })
      .filter((name) => !/\.(test|stories|aria\.stories)\.tsx$/.test(name))
      .map((name) => name.slice(0, -4))
    const documented = new Set(
      globSync('*.stories.tsx', { cwd: join(SRC, 'components', 'ui') }).map((name) =>
        name.slice(0, -'.stories.tsx'.length),
      ),
    )
    const undocumented = kit
      .filter((name) => !documented.has(name))
      .filter((name) => IMPORTS_RAC.test(readFileSync(join(SRC, 'components', 'ui', `${name}.tsx`), 'utf8')))
      .sort()

    expect(
      undocumented,
      'a React Aria component in the kit with no .stories.tsx, so no docs page',
    ).toEqual([])
  })
})
