/**
 * **A claim warns; it does not lock** -- and the way that stays true is that
 * the write path has never heard of claims.
 *
 * > #### Scenario: Somebody writes to a claimed entry
 * > - GIVEN an entry held by one analyst
 * > - WHEN another writes to it anyway
 * > - **THEN the write is judged on the version it was made against, not on
 * >   the claim**
 *
 * > Nothing MUST be built on a claim as though it were a lock. The record of
 * > who wrote what, and the refusal of a write made against a version that
 * > moved, are what make concurrent work safe. A claim is a courtesy on top of
 * > those.
 *
 * **A behavioural test cannot hold this.** Driving one write against a claimed
 * entry shows that *this* path ignores the claim; it says nothing about the
 * next path somebody adds. The property is about the whole write surface, and
 * the honest form of it is that the surface holds no reference to a claim at
 * all -- there is nothing there to build a lock on.
 *
 * The version half is asserted where it lives: a write naming a version that
 * has moved is refused, in `compliance.write.test.ts` and the collection
 * suites. This file asserts only the other half of the sentence.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))

/**
 * The modules that decide whether a write happens.
 *
 * `db/mutate.ts` is the versioned write every collection goes through, and
 * `collections/` is the generic path above it. If a claim ever became a
 * condition of writing, it would be read in one of these.
 */
const THE_WRITE_PATH = ['db/mutate.ts', 'collections', 'cases']

/** How an entry claim is spelled where it is implemented. */
const CLAIM_SURFACE = ['StoredClaim', 'claimsKey', '.claims(', '.claim(']

function filesUnder(relative: string): string[] {
  const path = join(SRC, relative)
  const stack = [path]
  const found: string[] = []
  while (stack.length > 0) {
    const next = stack.pop()!
    let entries
    try {
      entries = readdirSync(next, { withFileTypes: true })
    } catch {
      // A file rather than a directory, which `db/mutate.ts` is.
      if (/\.ts$/.test(next) && !/\.test\.ts$/.test(next)) found.push(next)
      continue
    }
    for (const entry of entries) {
      const child = join(next, entry.name)
      if (entry.isDirectory()) stack.push(child)
      else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) found.push(child)
    }
  }
  return found
}

describe('a claim is not a lock', () => {
  const swept = THE_WRITE_PATH.flatMap((one) => filesUnder(one))

  /**
   * **The vacuity guard**, and the one most likely to fail first: a directory
   * renamed out from under this list leaves the sweep covering nothing and
   * reporting the property held.
   */
  it('finds the write path to sweep', () => {
    expect(swept.length, 'the write path is not where this test thinks it is').toBeGreaterThan(5)
    expect(
      swept.some((path) => path.endsWith('mutate.ts')),
      'the versioned write itself is not in the sweep',
    ).toBe(true)
  })

  it('decides a write without reading any claim', () => {
    const offenders: string[] = []
    for (const path of swept) {
      const text = readFileSync(path, 'utf8')
      // Comments discuss claims freely -- the concurrency reasoning is all
      // over this tier -- and the code is the subject.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '')
      for (const spelling of CLAIM_SURFACE) {
        if (code.includes(spelling)) offenders.push(`${path.replace(SRC, '')}: ${spelling}`)
      }
    }

    expect(
      offenders,
      'the write path reads a claim, so a claim has become a condition of writing',
    ).toEqual([])
  })

  /**
   * **And the claim surface is real**, so the sweep above is looking for
   * something that exists. A rename of `StoredClaim` would otherwise leave it
   * searching for nothing and passing for ever.
   */
  it('is looking for a claim surface that exists', () => {
    const store = readFileSync(join(SRC, 'live', 'presence.store.ts'), 'utf8')
    const present = CLAIM_SURFACE.filter((spelling) => store.includes(spelling))
    expect(present, 'none of these spellings appears where claims are implemented').not.toEqual([])
  })
})
