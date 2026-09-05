import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **`lib/` is what both tiers may share, so it may depend on neither.**
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
