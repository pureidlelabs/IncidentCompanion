import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A link that looks like a button is a `Button` rendering the link.**
 *
 * `Button` defaults `nativeButton` to true, so handing it an `<a>` - or the
 * router's `Link`, which is one - logs *"a component that acts as a button
 * expected a native `<button>`"* on every render. Eight of those in one story
 * run is what turned this up.
 *
 * **`nativeButton={false}` is the answer, and it is the registry's own.**
 * ReUI ships this exact pattern twice - `c-button-27` renders a link and
 * `c-button-49` renders one as `variant="link"` - both with the prop set, and
 * the legacy tier follows it.
 *
 * `nativeButton` is a Base UI prop; React Aria has none, and the kit's `Link`
 * and `Button` are separate components rather than one wearing the other's
 * clothes. The scan is tree-wide because a Base UI button can still be
 * rendered from anywhere, and it shrinks to nothing when the last of that tier
 * goes.
 *
 * **What that costs is recorded rather than discovered later.** Base UI's
 * `useButton` adds `role="button"` as soon as it is told the element is not
 * native: the anchor answers `getByRole('button')` and not
 * `getByRole('link')`, so a screen reader announces these as buttons. Base
 * UI's own documentation argues against the
 * shape for that reason; the maintainer's call is that the registry's pattern wins,
 * and the trade is written here so nobody re-derives half of it.
 *
 * A test asserting one of these is a `link` is therefore asserting the wrong
 * thing, and would go red for the right reason if the prop were dropped.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const isSource = (name: string) => /\.tsx?$/.test(name) && !name.endsWith('.d.ts')

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...filesUnder(full, keep))
    else if (keep(entry)) found.push(full)
  }
  return found
}

/** A `Button` whose `render` is an anchor or the router's `Link`. */
const LINK_IN_BUTTON = /<Button\b((?:(?!\/>|>)[\s\S])*?)\brender=\{\s*<(a|Link)\b/g

describe('a link rendered as a button says it is not a native one', () => {
  it('sets `nativeButton={false}` at every site that renders a link', () => {
    const missing: string[] = []
    for (const path of filesUnder(SRC, isSource)) {
      if (path.endsWith('.rule.test.tsx')) continue
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(LINK_IN_BUTTON)) {
        if (!match[1]?.includes('nativeButton')) missing.push(relative(SRC, path))
      }
    }

    expect(
      [...new Set(missing)].sort(),
      'these log a Base UI warning on every render - `Button` rendering a link ' +
        'needs `nativeButton={false}`, which is the registry\'s own pattern',
    ).toEqual([])
  })
})
