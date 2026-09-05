import { readFileSync } from 'node:fs'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * A panel that floats over moving content has an opaque ground.
 *
 * **Read from source, because neither suite can see it.** jsdom has no
 * colours and no compositing, and the rendered defect is subtle enough that a
 * screenshot passes inspection: rows read *through* the bar at 95% rather than
 * colliding with it outright, which looks like a rendering artefact until
 * somebody scrolls a card behind a word.
 *
 * A blur is not a ground. `backdrop-blur` behind a translucent background
 * smears what is under it, so the letters underneath survive as a texture.
 *
 * **`fixed` counts, and reaches almost nothing.** A rule reading source can
 * only see classes written on one element, and this tree positions a floating
 * panel on a wrapper and grounds it on the child -- the failure banner and the
 * graph's HUD are both that shape, and neither is visible from here whatever
 * this pattern matches. What catches those is a browser reading computed
 * style, which is `server/e2e/visual/`'s. This holds the co-located case.
 */

/**
 * A background utility carrying an alpha, in each of the three spellings a
 * caller can write it: a published role, the variable shorthand, and an
 * arbitrary colour, each followed by an alpha.
 *
 * **The shorthand is not spelled out here.** Tailwind's scanner reads a comment
 * as readily as markup, so writing the class in prose generates it -- and the
 * example named a token nothing declares, which put two rules reading
 * `var(--head)` into the shipped stylesheet. Documenting a shorthand that names
 * a real token is fine; this one did not.
 */
const TRANSLUCENT = /\bbg-(?:[a-z0-9-]+|\((?:[^)]+)\)|\[[^\]]+\])\/(?:\[[^\]]+\]|\d+)/

/** Positioned out of the flow, over whatever passes beneath it. */
const FLOATS = /\b(?:sticky|fixed)\b/

/**
 * A blur standing in for a ground.
 *
 * The case this file argues hardest against and the one the alpha pattern
 * cannot see: an element with no background at all, smearing what passes
 * under it. A floating panel with a real ground may still carry a blur, so
 * this fires only where nothing opaque is declared beside it.
 */
const BLUR = /\bbackdrop-blur/

/** A ground with no alpha on it, in any of the three spellings. */
const OPAQUE_GROUND = /\bbg-(?:[a-z0-9-]+|\([^)]+\)|\[[^\]]+\])(?![\w-]*\/)/

/**
 * The same text with its comments gone.
 *
 * **A `tv()` call read whole swallows its own docstrings**, and prose says
 * `fixed` far more often than a class list does -- `select.tsx` describes *a
 * value picked from a fixed list* and was reported for a ground three
 * paragraphs away from it. Only classes are matched, so only classes are
 * kept.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/**
 * Every `className` expression in the file, brace-balanced, plus every `tv()`
 * call and every string literal.
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
  // **A `tv()` call whole, not slot by slot.** Its base may be an array, and
  // then `sticky` sits in one element of it and the ground in another -- read
  // separately, each half looks clean. `toast.tsx` is that shape.
  for (const match of source.matchAll(/\btv\(/g)) {
    let depth = 1
    let at = match.index + match[0].length
    while (at < source.length && depth > 0) {
      if (source[at] === '(') depth += 1
      else if (source[at] === ')') depth -= 1
      at += 1
    }
    found.push(source.slice(match.index, at))
  }
  // A slot naming its classes in a bare literal with no `className` in sight,
  // and a class built in a template literal.
  for (const match of source.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)) found.push(match[0])
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

describe('a floating panel is opaque', () => {
  it('finds the source to check', () => {
    expect(SOURCES.length).toBeGreaterThan(200)
  })

  it('gives every floating element a ground the rows cannot be read through', () => {
    const offenders: string[] = []
    for (const file of SOURCES) {
      for (const raw of classExpressions(readFileSync(file, 'utf8'))) {
        const expression = withoutComments(raw)
        if (!FLOATS.test(expression)) continue
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
