import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A change to a child reaches its parent, because the parent imports it.**
 *
 * ## What it cannot see
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * The shortest markup worth calling a copy, in normalised characters.
 */
const SIZE_FLOOR = 240

/** The tiers whose markup is meant to be shared. */
const FILES = glob
  .sync(`${SRC}/{components,screens}/**/*.tsx`)
  .filter((path) => !/\.(test|stories)\.tsx$/.test(path))

/** Comments out, whitespace flattened, so formatting is not what differs. */
function normalise(markup: string): string {
  return markup
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Where a parenthesised JSX body starts: a `return (` or an arrow's `=> (`.
 */
const OPENS = /(?:return|=>)\s*\(\s*</g

/**
 * Every parenthesised JSX body in a file, normalised.
 */
function markupIn(text: string): string[] {
  const found: string[] = []
  for (const opened of [...text.matchAll(OPENS)]) {
    const paren = text.indexOf('(', opened.index)
    let depth = 0
    let at = paren
    for (; at < text.length; at += 1) {
      if (text[at] === '(') depth += 1
      if (text[at] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const body = normalise(text.slice(paren + 1, at))
    if (body.length >= SIZE_FLOOR) found.push(body)
  }
  return found
}

/** Normalised markup -> the files that draw it. */
function copies(): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  for (const path of FILES) {
    const where = relative(SRC, path).replaceAll('\\', '/')
    for (const body of markupIn(readFileSync(path, 'utf8'))) {
      const at = seen.get(body) ?? []
      if (!at.includes(where)) at.push(where)
      seen.set(body, at)
    }
  }
  return seen
}

describe('nothing is drawn twice', () => {
  const found = copies()

  it('finds markup to read', () => {
    expect([...found.keys()].length).toBeGreaterThan(30)
  })

  /**
   * Two files drawing the same markup is the mechanism by which an edit stops
   * propagating.
   */
  it('draws no markup in two places', () => {
    const twice = [...found.entries()]
      .filter(([, at]) => at.length > 1)
      .map(([body, at]) => `${at.join(' == ')}  [${body.slice(0, 60)}...]`)
      .sort()
    expect(
      twice,
      'this markup is written in more than one file, so an edit to one of them ' +
        'reaches one screen and leaves the other drawing the old shape. Lift ' +
        'it into a block and import it from both.',
    ).toEqual([])
  })
})
