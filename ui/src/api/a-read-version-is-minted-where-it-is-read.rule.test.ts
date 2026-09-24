/**
 * A write's version is minted where the analyst read the row, and every
 * versioned write leaves through the one door that orders a tab's writes.
 *
 * The type does half of this: a hook takes a read version, so a version picked
 * off the cache does not compile. What a type cannot hold is where the read
 * version is minted, and whether a new write skips the door, so this sweeps
 * the source for both.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')

/**
 * Where a row is read for a write: a change to a field, a selection, and the
 * one-act row controls that write what the analyst is looking at as they press.
 */
const MINTS = new Set([
  'api/rowDraft.ts',
  'components/blocks/bulk-actions.tsx',
  'screens/timeline.tsx',
  'app/case/NotesContainer.tsx',
  'app/case/ReportContainer.tsx',
])

const source = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
  .filter((path) => !/\.(test|stories)\.tsx?$/.test(path) && !path.includes('/demo/'))
  .map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }))

describe('a read version is minted where the row is read', () => {
  it('finds the client source at all', () => {
    expect(source.length).toBeGreaterThan(50)
  })

  it('mints one nowhere else', () => {
    const minting = source
      .filter(
        ({ path, text }) =>
          path !== 'api/rowWrite.ts' &&
          /import[^;]*\bdrawn\b[^;]*rowWrite'/.test(text) &&
          /\bdrawn\s*\(/.test(text),
      )
      .map(({ path }) => path)
      .sort()

    expect(minting).toEqual([...MINTS].sort())
  })
})

/** The index just past the parenthesis that closes the one opening at `open`. */
function closing(text: string, open: number): number {
  let depth = 0
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '(') depth += 1
    else if (text[at] === ')' && (depth -= 1) === 0) return at + 1
  }
  return text.length
}

/** Every call of `request` that writes a versioned case row, with whether a door call encloses it. */
const writes = source.flatMap(({ path, text }) =>
  [...text.matchAll(/\brequest(?:<[^()]*?>)?\s*\(/g)].flatMap((call) => {
    const at = call.index
    const args = text.slice(at, closing(text, text.indexOf('(', at)))
    if (!args.includes('/cases/') || !/method: '(PATCH|DELETE)'|\/bulk-delete/.test(args)) return []
    const inside = [...text.matchAll(/\bwriteRows?\s*\(/g)].some(
      (door) => door.index < at && closing(text, text.indexOf('(', door.index)) > at,
    )
    return [{ where: `${path}:${String(text.slice(0, at).split('\n').length)}`, inside }]
  }),
)

describe('every versioned write leaves through the door', () => {
  it('finds the versioned writes at all', () => {
    expect(writes.length).toBeGreaterThanOrEqual(6)
  })

  it('sends none of them around it', () => {
    expect(writes.filter(({ inside }) => !inside).map(({ where }) => where)).toEqual([])
  })
})
