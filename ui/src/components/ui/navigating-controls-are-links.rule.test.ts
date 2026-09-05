/**
 * Nothing in the tree dresses a navigating control as a button.
 *
 * *What navigates is a link, what acts is a button, and neither MUST be dressed
 * as the other.*
 *
 * `what-navigates-is-a-link.test.tsx` holds what `ButtonLink` and `Button`
 * each render. This is the half that component test cannot reach: the screen
 * that reached for `Button` and handed it an `href`, which is where the rule is
 * actually broken and which no per-component test is written for.
 *
 * **A rule test rather than a case in that file**, because a sweep needs
 * `import.meta.url` to be a file URL and it is not in the project the component
 * tests run in -- `a-screen-draws-no-geometry.rule.test.ts` and
 * `base-prefix.rule.test.ts` are here for the same reason. The basenames differ
 * on purpose: `CLAUDE.md` records that a `.ts` beside a `.tsx` of one name
 * shadows it, leaving the shadowed file checked by nothing while its suite goes
 * on passing.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../../')

/** A `Button` given somewhere to go. `ButtonLink` is drawn identically. */
const DRESSED = /<Button\b[^>]*\shref[=\s]/

describe('a control that takes the analyst somewhere', () => {
  it('has a tree to sweep, so a moved directory does not empty this', () => {
    const files = globSync('**/*.tsx', { cwd: SRC })
    expect(files.length, 'no component or screen was found to read').toBeGreaterThan(50)
  })

  it('is never a Button carrying an href', () => {
    const offenders = globSync('**/*.tsx', { cwd: SRC, absolute: true })
      .filter((one) => !/\.(test|stories)\.tsx$/.test(one))
      .filter((one) => DRESSED.test(readFileSync(one, 'utf8')))
      .map((one) => relative(SRC, one))
      .sort()

    expect(
      offenders,
      'these render a Button with an href, so a control that navigates announces itself as ' +
        'acting: it is not followed with Enter, offers no "open in a new tab", and a screen ' +
        'reader calls it a button. `ButtonLink` is drawn identically',
    ).toEqual([])
  })
})
