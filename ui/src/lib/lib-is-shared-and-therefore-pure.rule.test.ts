import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **`lib/` is what both tiers may share, so it may depend on neither.**
 *
 * The gallery (`screens/`) and the running app (`app/`) answer the same
 * questions about a case -- how long a gap is, what a heading resolves to, how
 * many hours a statutory clock has left. When each keeps its own copy the two
 * drift, and they drift silently, because both suites stay green while the
 * answers diverge.
 *
 * **Measured on this branch, in a single night**: two `durationText`s
 * disagreeing about whether thirty seconds reads as `0m` or `under a minute`;
 * two action-class maps disagreeing on the fallback for an unknown action; and
 * a statutory clock **four hours out**, because one implementation appended `Z`
 * and read UTC while the other let `Date.parse` read the viewer's own zone. All
 * three were rendered. A test even pinned one of the divergences and passed.
 *
 * So this rule is the boundary that makes `lib/` a library rather than a
 * folder: **one import restriction, from which purity follows.** A module that
 * cannot reach a component, a screen or the app cannot hold a React element,
 * a query, or a piece of app state -- it can only take data and return an
 * answer, which is exactly what is safe to share.
 *
 * It does not fence `@/api` or `@contract`: those are the shape of the data
 * itself, and a derivation that may not name its own input is useless.
 *
 * **Green the day it was written**, so it refuses the next violation rather
 * than reporting a backlog nobody clears.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = resolve(SRC, 'lib')

/** Both spellings: `@/app/x` and a relative climb out to `../app/x`. */
const REACHES_UP = /from\s+'(?:@\/|\.\.\/)(app|screens|components)\//g

describe('lib is shared, and therefore pure', () => {
  const files = glob
    .sync('**/*.{ts,tsx}', { cwd: LIB, absolute: true })
    .filter((file) => !/\.(test|stories)\.tsx?$/.test(file))

  it('reads the modules it is meant to hold', () => {
    // The guard every rule here carries: an empty scan passes every assertion
    // below, and looks exactly like a clean tree.
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => f.endsWith('case-time.ts'))).toBe(true)
  })

  it('reaches up to no tier that renders', () => {
    const reaching: string[] = []
    for (const file of files) {
      for (const [, tier] of readFileSync(file, 'utf8').matchAll(REACHES_UP)) {
        reaching.push(`${relative(SRC, file).replaceAll('\\', '/')} -> ${String(tier)}/`)
      }
    }
    expect(
      [...new Set(reaching)].sort(),
      'a shared module reached a tier that renders -- it can no longer be shared, ' +
        'so either it belongs in that tier, or the part it needs belongs here',
    ).toEqual([])
  })
})
