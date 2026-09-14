/**
 * **`sameAddress` is the only way a query addresses the user row by email.**
 *
 * A `where` comparing the column to the string a caller typed matches nothing
 * the moment one letter is capitalised, and a `where` matching nothing is not
 * an error: a password hold addressed by the typed spelling applies to nothing,
 * so the password the administrator chose is permanent and no screen says so.
 *
 * **Better Auth folds the address on the paths that write one** -
 * `internalAdapter.createUser`, the admin plugin's create route and sign-in all
 * lower-case it. The fold is on the column for the row written by anything
 * else, and `user_email_folded` is what keeps that row from being a second
 * account. -> `db/schema/auth.ts`
 *
 * **A ratchet, not an audit.** It cannot find a bypass that predates it; it
 * stops the next one.
 *
 * **Two shapes, because the defect has had two.** A `drizzle-orm` comparator
 * on `user.email`, and a JavaScript `===` against an address held in memory -
 * which is what the accounts controller did to the whole roster while this
 * rule reported compliance. A caller writing raw SQL is stopped by neither and
 * is not the failure mode.
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

/**
 * An address compared in JavaScript rather than by the database.
 *
 * Identity is the account id, so a comparison of two addresses is either a
 * lookup that should have been `byAddress` or an identity check that should
 * have been on `id`.
 */
const TYPED_MATCH = /\.email\s*[=!]==/

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
    // The shape the accounts controller had, six times, while this rule was green.
    expect(TYPED_MATCH.test('  .find((one) => one.email === username)')).toBe(true)
    expect(TYPED_MATCH.test('  if (target.id === session.user.id) {')).toBe(false)
  })

  it('is the only predicate matching an address', () => {
    const outside = files
      .filter((path) => !ALLOWED.includes(relative(SRC, path).split('\\').join('/')))
      .filter((path) => {
        const text = readFileSync(path, 'utf8')
        return EXACT_MATCH.test(text) || TYPED_MATCH.test(text)
      })
      .map((path) => relative(SRC, path))
      .sort()

    expect(
      outside,
      'a write keyed on the typed spelling misses a folded row and refuses nothing',
    ).toEqual([])
  })
})
