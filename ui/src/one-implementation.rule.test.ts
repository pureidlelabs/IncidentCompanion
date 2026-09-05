import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **One component name, one implementation.**
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * An exported component declaration.
 */
const EXPORTED = /export function ([A-Z][A-Za-z0-9]*)/g

/**
 * A trailing `export { X, Y as Z }`, and never `export { X } from '...'`.
 */
const EXPORT_BLOCK = /export\s*\{([^}]*)\}\s*(?!from)/g

/** Every component name a file exports, by declaration or by trailing block. */
function exportedBy(text: string): string[] {
  const found = [...text.matchAll(EXPORTED)].map(([, name]) => name ?? '')
  for (const [whole, list = ''] of text.matchAll(EXPORT_BLOCK)) {
    const at = text.indexOf(whole)
    if (/^\s*from/.test(text.slice(at + whole.length, at + whole.length + 8))) continue
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim() ?? ''
      if (/^[A-Z][A-Za-z0-9]*$/.test(name)) found.push(name)
    }
  }
  return found.filter((name) => name !== '')
}


/** The file's name without its extension. */
function baseOf(file: string): string {
  return file.replace(/\.tsx?$/, '')
}

/**
 * The forks standing today, each with why it is still two.
 */
const KNOWN = new Map<string, string[]>()

describe('a component name has one implementation', () => {
  const files = glob
    .sync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })
    .filter((file) => !/\.(test|stories)\.tsx?$/.test(file))

  /**
   * **Keyed on the name folded to lower case**, so a pair differing only by
   * capitalisation is one name here.
   *
   * `Textarea` and `TextArea` were two live multi-line boxes in the kit, told
   * apart by a single capital, and a caller reaching for the wrong one got a
   * box with no label. Comparing the names as written cannot see that pair, and
   * a rule that exists to catch a second implementation should not be defeated
   * by the shift key.
   */
  const where = new Map<string, Set<string>>()
  const spelling = new Map<string, Set<string>>()
  for (const file of files) {
    for (const name of exportedBy(readFileSync(file, 'utf8'))) {
      const key = name.toLowerCase()
      const seen = where.get(key) ?? new Set<string>()
      seen.add(file)
      where.set(key, seen)
      const spelt = spelling.get(key) ?? new Set<string>()
      spelt.add(name)
      spelling.set(key, spelt)
    }
  }

  /** The files a name is exported from, whatever it is capitalised as. */
  function ours(name: string): string[] {
    return [...(where.get(name.toLowerCase()) ?? [])]
  }

  /** Every spelling one name is exported under, for the report. */
  function spellings(key: string): string[] {
    return [...(spelling.get(key) ?? [])].sort()
  }

  it('reads the tree it is meant to hold', () => {
    // The guard: a bad glob or a regex that stops matching leaves every
    // assertion below passing over nothing, which is what this rule looks like
    // when it has quietly died.
    expect(files.length).toBeGreaterThan(300)
    expect(where.size).toBeGreaterThan(300)
    expect(where.has('datatable')).toBe(true)
  })

  it('reads a trailing export block, and walks past a re-export', () => {
    // The half of the hole this closes is invisible otherwise: a reader that
    // stopped matching the block would leave every fork below it pardoned, and
    // the suite would print the same green as a tree with one implementation.
    expect(exportedBy('function Input() {}\nexport { Input }')).toEqual(['Input'])
    expect(exportedBy('export { Input as Box, controlBase }')).toEqual(['Box'])
    expect(exportedBy("export { Input } from './field'")).toEqual([])
    // And a live file spelling it this way is actually read by the block:
    // `input.tsx` declares `function Input` with no `export` keyword and
    // exports it through a trailing block one line down.
    expect(ours('Input').map((file) => relative(SRC, file).replaceAll('\\', '/')).sort()).toEqual([
      'components/ui/input.tsx',
    ])
  })


  it('grows no second implementation of a name', () => {
    const forks: string[] = []
    for (const [name] of where) {
      const seen = ours(name)
      const bases = new Set(seen.map(baseOf))
      if (bases.size < 2) continue
      const paths = seen.map((file) => relative(SRC, file).replaceAll('\\', '/')).sort()
      if (KNOWN.get(name)?.join() === paths.join()) continue
      forks.push(`${spellings(name).join('/')}: ${paths.join(', ')}`)
    }
    expect(
      forks.sort(),
      'a name exported by two different components -- give one a name of its own, or collapse them',
    ).toEqual([])
  })

  it('holds no excuse that has stopped being a fork', () => {
    // The same staleness check its siblings carry: an entry left here after the
    // pair collapsed goes on pardoning whatever takes the name next.
    const spent = [...KNOWN]
      .filter(([name, paths]) => {
        const seen = ours(name)
        if (seen.length === 0) return true
        const now = seen.map((file) => relative(SRC, file).replaceAll('\\', '/')).sort()
        return now.join() !== paths.join()
      })
      .map(([name]) => name)
      .sort()
    expect(spent, 'these are excused and are no longer that fork -- delete them').toEqual([])
  })

  it('names files that exist', () => {
    for (const [, paths] of KNOWN) {
      for (const path of paths) {
        expect(() => readFileSync(join(SRC, path)), path).not.toThrow()
      }
    }
  })
})
