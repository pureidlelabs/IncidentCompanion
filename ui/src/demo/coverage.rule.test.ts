/**
 * **Every path the client asks for is one the demo has an answer about.**
 *
 * An answer includes refusing: what this refuses is a path nobody has decided
 * about, because that is the one that reaches a visitor as a screen drawing
 * nothing. A route added to the client is either served by the demo or listed
 * below as deliberately absent, and the listing is what a reviewer reads.
 *
 * This is the whole of what keeps a published demo honest as the application
 * moves, so it fails loudly rather than skipping when it cannot find the client.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const API = join(HERE, '../api')

/**
 * The first path segment of every route `src/api` asks for.
 *
 * A segment rather than a whole path: the demo routes on the first one, and an
 * interpolated id makes the rest unreadable from source anyway.
 *
 * Two forms, because a narrower sweep missed `/report/languages` and
 * `/report-snippets` both: a literal in the call - where the type argument may
 * nest, as `request<Partial<X> | null>` does - and a module constant holding
 * the path. `client.ts` declares the base
 * and the beacon and calls nothing, so its own constants are not routes a
 * caller asked for.
 */
function askedFor(): ReadonlySet<string> {
  const found = new Set<string>()
  const files = globSync('**/*.ts', { cwd: API, absolute: true }).filter(
    (path) => !/\.(test|stories)\.tsx?$/.test(path),
  )
  expect(files.length, 'no client api source found; has src/api moved?').toBeGreaterThan(20)

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(
      /\b(?:request|requestBody|requestRaw|requestBlob)\s*(?:<[^()]*>)?\s*\(\s*[`'"]\/([a-z][a-z0-9-]*)/g,
    )) {
      found.add(match[1] ?? '')
    }
    if (file.endsWith('client.ts')) continue
    for (const match of source.matchAll(/^\s*const [A-Z_]+ = ['"`]\/([a-z][a-z0-9-]*)/gm)) {
      found.add(match[1] ?? '')
    }
  }
  return found
}

/** What the demo answers. Kept beside the handler's own routing table. */
const SERVED = new Set(['cases'])

/**
 * Asked for by the client, deliberately not answered by the demo.
 *
 * Each of these refuses, which the analyst sees as the application's ordinary
 * refused-write card rather than as a blank screen. Deleting a name from here
 * without serving it is what this test exists to catch.
 */
const REFUSED = new Set([
  // Rendered from the server's own catalogue; served once the build snapshots them.
  'about',
  'collections',
  'demos',
  'specs',
  'regimes',
  'library',
  'report-block-kinds',
  'report-layouts',
  'report-snippets',
  'report',
  'recent-cases',
  // Administration, which a single-visitor demo has no subject for.
  'accounts',
  'appearance',
  'change-password',
  'install',
  'setup',
  'health',
  // Parsed or rendered server-side.
  'imports',
])

describe('the demo has decided about every route the client calls', () => {
  it('serves or refuses each of them, with none left undecided', () => {
    const undecided = [...askedFor()].filter((segment) => !SERVED.has(segment) && !REFUSED.has(segment))
    expect(
      undecided.sort().join(', '),
      'a client route the demo neither serves nor lists as refused: add it to SERVED once the ' +
        'handler answers it, or to REFUSED to publish the demo without it',
    ).toBe('')
  })

  it('lists nothing it does not need to', () => {
    const asked = askedFor()
    const stale = [...SERVED, ...REFUSED].filter((segment) => !asked.has(segment))
    expect(stale.sort().join(', '), 'listed here but no longer called by the client').toBe('')
  })
})
