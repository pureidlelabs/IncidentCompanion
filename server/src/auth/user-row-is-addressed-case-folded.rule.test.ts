/**
 * **`sameAddress` is the only way a query addresses the user row by email.**
 *
 * Better Auth folds the address on every path that writes one, so a `where`
 * comparing the column to the string a caller typed matches nothing the moment
 * one letter is capitalised - and a `where` matching nothing is not an error.
 * An account created as `Case.Folded@Example.Invalid` is stored folded, so a
 * password hold addressed by the typed spelling applies to nothing: the
 * password the administrator chose is permanent and no screen says so.
 *
 * **A ratchet, not an audit.** It was green the day it was written - the three
 * call sites it would have found are the three the fix moved. It cannot find a
 * bypass that predates it; it stops the fourth.
 *
 * **Structural, and deliberately narrow.** It reads for `user.email` inside a
 * `drizzle-orm` comparator, which is the shape the defect had three times. A
 * caller writing raw SQL is not stopped by this and is not the failure mode:
 * the failure mode is somebody reaching for `eq` because that is what every
 * other column in this tree takes.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')

/** `same-address.ts` is the predicate itself, and states the rule. */
const ALLOWED = ['auth/same-address.ts']

const EXACT_MATCH = /\b(?:eq|ne|inArray|notInArray|like|ilike)\s*\(\s*(?:schema\.)?user\.email\b/

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') sources(full, found)
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

describe('the user row is addressed case-folded', () => {
  const files = sources(SRC)

  it('finds source to read', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('sees the shape it is looking for', () => {
    // Without this the rule passes just as well when `EXACT_MATCH` has stopped
    // matching anything at all - a typo in the pattern reads as compliance.
    expect(EXACT_MATCH.test('  .where(eq(user.email, email))')).toBe(true)
    expect(EXACT_MATCH.test('  .where(eq(schema.user.email, attempted))')).toBe(true)
    expect(EXACT_MATCH.test('  .where(sameAddress(email))')).toBe(false)
  })

  it('is the only predicate matching an address', () => {
    const outside = files
      .filter((path) => !ALLOWED.includes(relative(SRC, path).split('\\').join('/')))
      .filter((path) => EXACT_MATCH.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path))
      .sort()

    expect(
      outside,
      'a write keyed on the typed spelling misses a folded row and refuses nothing',
    ).toEqual([])
  })
})
