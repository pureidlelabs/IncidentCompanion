import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

/**
 * **One severity ramp, and every chip draws from it.**
 *
 * **A map keyed by the severity names, not any use of the tokens.** A
 * kill-chain position drawn in `bg-severity-medium` and a row highlighted in
 * `bg-severity-info/10` are the palette being reused for something that is not
 * a severity, which is a different question from this one. What this refuses
 * is a second table saying what severity is what colour.
 *
 * **`timeline-entry-row`'s rail is not one either**, and that is the line this
 * rule has to draw carefully: it is keyed by severity and it is deliberately
 * not the chip ramp -- no ink, and `none` is a dashed border rather than a
 * fill. A variant with its own reason is not a copy, so the test is the whole
 * ramp rather than any two of its rows.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Where the ramp is allowed to be written out. */
const THE_RAMP = 'components/ui/severity-tones.ts'

/**
 * Every severity the ramp names, with the fill a copy would have to give it.
 *
 * Whole rather than built from a prefix: `styles/every-name-resolves.rule.test.ts`
 * reads this file, and a bare `bg-severity-` is not a colour the theme publishes.
 */
const FILL: Readonly<Record<string, string>> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
  none: 'bg-severity-none',
}

describe('the severity ramp', () => {
  const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
    .filter((file) => !/\.(test|stories)\.tsx?$/.test(file))

  it('reads the tree it is meant to hold', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('is written out in one module and copied into none', () => {
    const copies: string[] = []
    for (const file of files) {
      const where = relative(SRC, file).replaceAll('\\', '/')
      if (where === THE_RAMP) continue
      const text = readFileSync(file, 'utf8')
      // A copy names every level and gives each one a severity fill. A
      // variant that leaves one out, or fills one differently, is not this.
      const complete = Object.entries(FILL).every(([level, fill]) =>
        text.includes(`${level}: '${fill}'`),
      )
      if (complete) copies.push(where)
    }

    expect(
      copies.sort(),
      'these say what severity is what colour, and the ramp already does',
    ).toEqual([])
  })
})
