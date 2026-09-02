import { readFileSync } from 'node:fs'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * A head stuck in front of a scroller has an opaque ground.
 *
 * **Read from source, because neither suite can see it.** jsdom has no
 * colours and no compositing, and the rendered defect is subtle enough that a
 * screenshot passes inspection: rows read *through* the bar at 95% rather than
 * colliding with it outright, which looks like a rendering artefact until
 * somebody scrolls a card behind a word.
 *
 * A blur is not a ground. `backdrop-blur` behind a translucent background
 * smears what is under it, so the letters underneath survive as a texture.
 */

/**
 * A background utility carrying an alpha, in each of the three spellings a
 * caller can write it: `bg-background/95`, `bg-(--head)/80`, `bg-[#101010]/80`.
 */
const TRANSLUCENT = /\bbg-(?:[a-z0-9-]+|\((?:[^)]+)\)|\[[^\]]+\])\/(?:\[[^\]]+\]|\d+)/

/**
 * A blur standing in for a ground.
 *
 * The one the docstring above argues hardest against and the one the alpha
 * pattern cannot see: an element with no background at all, smearing what
 * passes under it. A sticky head with a real ground may still carry a blur,
 * so this fires only where nothing opaque is declared beside it.
 */
const BLUR = /\bbackdrop-blur/
const OPAQUE_GROUND = /\bbg-(?:[a-z0-9-]+|\([^)]+\)|\[[^\]]+\])(?![\w-]*\/)/

/**
 * Every `className` expression in the file, brace-balanced, plus every string
 * literal.
 *
 * **The whole expression, not the line.** A `cn()` call splits one element's
 * classes across arguments -- the bar this rule was written for carried
 * `sticky` on one argument and its ground on the next, so a line-window read
 * both as clean.
 */
function classExpressions(source: string): string[] {
  const found: string[] = []
  const attribute = /className=(\{|")/g
  for (const match of source.matchAll(attribute)) {
    const from = match.index + match[0].length
    if (match[1] === '"') {
      const end = source.indexOf('"', from)
      if (end !== -1) found.push(source.slice(from, end))
      continue
    }
    let depth = 1
    let at = from
    while (at < source.length && depth > 0) {
      if (source[at] === '{') depth += 1
      else if (source[at] === '}') depth -= 1
      at += 1
    }
    found.push(source.slice(from, at))
  }
  // A `tv()` slot names its classes in a bare literal with no `className` in
  // sight, and `table.tsx` sticks its header from one.
  for (const match of source.matchAll(/'[^'\n]*'|"[^"\n]*"/g)) found.push(match[0])
  return found
}

/**
 * Every source file this rule is answerable for.
 *
 * **Counted, because the glob resolves against the working directory.** Run
 * from `ui/` it walks 419 files; run from the repository root it walks 0, and
 * an empty walk passes the rule below without reading anything -- the same
 * shape as a clean Vale run over no files. Four of the five sibling rule
 * tests carry this guard.
 */
const SOURCES = glob
  .sync('src/**/*.{ts,tsx}', { cwd: process.cwd() })
  .filter((file) => !/\.(test|stories)\.tsx?$/.test(file))

describe('a sticky head is opaque', () => {
  it('finds the source to check', () => {
    expect(SOURCES.length).toBeGreaterThan(200)
  })

  it('gives every sticky element a ground the rows cannot be read through', () => {
    const offenders: string[] = []
    for (const file of SOURCES) {
      for (const expression of classExpressions(readFileSync(file, 'utf8'))) {
        if (!/\bsticky\b/.test(expression)) continue
        const alpha = TRANSLUCENT.exec(expression)
        if (alpha) offenders.push(`${file}: ${alpha[0]}`)
        else if (BLUR.test(expression) && !OPAQUE_GROUND.test(expression)) {
          offenders.push(`${file}: backdrop-blur with no ground`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
