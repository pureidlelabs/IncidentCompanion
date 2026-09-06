import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A change to a child reaches its parent, because the parent imports it.**
 *
 * That is the whole promise of the tier ladder: edit a component and every
 * block follows, edit a block and every layout and screen follows. It holds
 * for exactly one reason -- there is one copy, and everything above it points
 * at that copy. The moment a second copy of the same markup exists, an edit
 * reaches one of them, both go on rendering, and the disagreement is found
 * months later by eye.
 *
 * **`one-implementation.rule.test.ts` guards the name and says so.** Its own
 * docstring records the hole: a *private* declaration nothing exports is
 * invisible to it, so a component lifted into the kit while a caller keeps a
 * character-for-character private copy reads as one implementation while the
 * app draws the stale one.
 *
 * A name is not what duplicates. Markup is. So this reads the markup.
 *
 * ## How it decides two things are the same
 *
 * It takes each component's returned JSX, strips comments and collapses
 * whitespace, and groups by what is left. Two components with byte-identical
 * normalised markup are one component written twice, whatever they are called.
 *
 * `SIZE_FLOOR` keeps it off the short ones. A four-line wrapper that happens to
 * match another four-line wrapper is a coincidence rather than a copy, and a
 * rule that reports coincidences is one somebody switches off -- which is the
 * argument `one-implementation` records for refusing to widen itself.
 *
 * ## What it cannot see
 *
 * A copy somebody edited. Rename one class and the hashes part, and this says
 * nothing -- which is the case a reader catches and no rule does. It answers
 * "was this pasted", never "are these the same idea".
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * The shortest markup worth calling a copy, in normalised characters.
 *
 * Under this, a match is two small wrappers converging rather than one being
 * pasted from the other.
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
 *
 * **Both forms, because reading one of them is a rule that covers a third of
 * the tree and says otherwise.** Measured over `components/` and `screens/`:
 * 933 `return (`, 841 `=> (`, 148 a bare `return <Tag`. Reading only the first
 * left the arrow bodies -- every cell renderer, every slot passed inline --
 * unread, which is where a pasted table column would live.
 */
const OPENS = /(?:return|=>)\s*\(\s*</g

/**
 * Every parenthesised JSX body in a file, normalised.
 *
 * Walks from the opening parenthesis to the one that closes it, so a nested
 * call inside the markup does not truncate the body.
 *
 * **A bare `return <Tag ...>` is still unread**, 148 of them. Closing that
 * needs a parser rather than a bracket walk, and the form is almost always a
 * one-line passthrough -- which `SIZE_FLOOR` would drop anyway.
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
   * propagating. Neither file is wrong on its own, which is why nothing else
   * catches it.
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
