/**
 * Nothing in the tree dresses a navigating control as a button.
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
