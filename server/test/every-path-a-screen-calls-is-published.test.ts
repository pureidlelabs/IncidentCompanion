/**
 * Every address the client asks for is one the published document offers.
 *
 * *The interface is the product, and the screens are a consumer* -- so a screen
 * reaching an address no caller could find is the requirement failing, whether
 * or not the screen works. The document is what a third party builds against,
 * and a route the screens use and it omits is a private interface nobody
 * declared.
 *
 * **Compared against the document rather than against the router.**
 * `openapi-contract.test.ts` already holds served-implies-documented; this is
 * the other direction and a different failure: a path the client calls that
 * nothing serves at all reaches the SPA catch-all and comes back as HTML, so
 * no screen shows a sentence. `ui/src/api/base-prefix.rule.test.ts` records
 * that shape, found by the maintainer rather than by a test.
 *
 * **Read off the client's own source**, because the alternative -- listing the
 * paths here -- is the constant checked against itself.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, type Harness } from './app-harness.js'

const API = fileURLToPath(new URL('../../ui/src', import.meta.url))

/**
 * The three helpers that reach the server, and the opening of their first
 * argument. Named from `base-prefix.rule.test.ts`, which sweeps for the same
 * three -- a fourth added without being listed in both is invisible to either.
 */
const CALL = /\b(?:request|requestBody|requestRaw)\s*(?:<[^>]*>\s*)?\(\s*(['"`])([^'"`]*)\1/g

/** Trailing slash off, so `/specs` and `/specs/` are one address. */
const shape = (path: string): string => path.replace(/\/+$/, '')

/**
 * Every **fixed** address the client asks for, with the file that asks.
 *
 * **Interpolated paths are excluded, and that is the limit of this test.** The
 * client addresses collections generically -- one `/cases/${id}/${collection}`
 * client for all of them -- while the document lists each concretely, so the
 * two are different vocabularies and comparing them needs the collection
 * registry encoded here. That would assert the mapping rather than the
 * product. What is left is exact: an address written out in full on one side
 * and published on the other.
 *
 * So a parameterised route the document omits is **not** caught here.
 * `openapi-contract.test.ts` holds the other direction for all of them.
 */
function asked(): { path: string; where: string }[] {
  const found: { path: string; where: string }[] = []
  for (const file of globSync('**/*.{ts,tsx}', { cwd: API, absolute: true })) {
    if (/\.(test|stories)\.tsx?$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(CALL)) {
      const raw = match[2]
      if (raw === undefined || !raw.startsWith('/') || raw.includes('${')) continue
      found.push({ path: raw, where: file.slice(API.length + 1) })
    }
  }
  return found
}

let harness: Harness | null = null

describe.skipIf(!(await bootable()))('the addresses the client asks for', () => {
  beforeAll(async () => {
    harness = await boot()
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('finds calls to sweep, so a renamed helper does not empty this', () => {
    expect(asked().length).toBeGreaterThan(15)
  })

  it('publishes every fixed one of them', () => {
    const published = new Set(
      Object.keys(harness!.document.paths ?? {})
        .filter((one) => !one.includes('{'))
        .map((one) => shape(one.replace(/^\/api/, ''))),
    )
    expect(published.size, 'the document offered no paths to compare against').toBeGreaterThan(20)

    const missing = [...new Set(
      asked()
        .filter(({ path }) => !published.has(shape(path)))
        .map(({ path, where }) => `${path}  (${where})`),
    )].sort()

    expect(
      missing,
      'the client asks for these and the published document does not offer them, so a ' +
        'caller building from the document cannot do what the screens do',
    ).toEqual([])
  })
})
