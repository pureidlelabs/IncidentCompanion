import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **The design language the document declares must be one `tokens.css` speaks,
 * and the two dark sets must agree.**
 *
 * Both are silent when wrong. A language with no block falls through to
 * `:root` and renders whatever the fallback set happens to be; the two dark
 * blocks diverging shows one ground to an analyst who set a theme and another
 * to one following the OS.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
/**
 * `tokens.css` with its comments stripped.
 *
 * The comments quote selectors as worked examples, including one for a
 * language that was deleted -- so a plain text search finds a block that is
 * not declared, and the rule below passed the exact mutation it exists to
 * catch until this was added.
 */
const TOKENS = readFileSync(join(HERE, 'ground.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const INDEX = readFileSync(join(HERE, '..', '..', 'index.html'), 'utf8')
const SRC = join(HERE, '..')

/** Every `.ts`/`.tsx` under `src`, with comments stripped. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/**
 * What ships: no test, no story, no fixture. A test setting or clearing the
 * attribute is arranging a document, which is the thing this rule says only a
 * document may do.
 */
const SOURCE = sourceFiles(SRC).filter(
  (path) => !/\.(test|stories|rule\.test)\.tsx?$/.test(path) && !path.includes(`${sep}test${sep}`),
)
  .map((path) => ({
    path,
    text: readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  }))

/** The `--name: value` pairs of the block a selector opens, brace-matched. */
function tokensOf(selector: string): Record<string, string> {
  const at = TOKENS.indexOf(selector)
  if (at === -1) return {}
  const open = TOKENS.indexOf('{', at)
  let depth = 0
  for (let i = open; i < TOKENS.length; i += 1) {
    if (TOKENS[i] === '{') depth += 1
    else if (TOKENS[i] === '}') {
      depth -= 1
      if (depth === 0) {
        const body = TOKENS.slice(open + 1, i)
        return Object.fromEntries(
          [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, (v ?? '').trim()]),
        ) as Record<string, string>
      }
    }
  }
  return {}
}

describe('the languages the document can name', () => {
  it('declares the one index.html asks for', () => {
    const asked = /<html[^>]*\sdata-language="([^"]+)"/.exec(INDEX)?.[1] ?? ''
    expect(asked, 'index.html declares no data-language').not.toBe('')
    expect(
      TOKENS.includes(`[data-language='${asked}']`),
      `index.html asks for the "${asked}" language and tokens.css declares no block for it, ` +
        'so the first painted frame falls through to :root',
    ).toBe(true)
  })

  it('keeps the unlayered dark fallback equal to the language it copies', () => {
    // The fallback has to be unlayered to beat every `@layer base` rule, and
    // CSS cannot alias a whole block -- so it is copied, and this is what
    // holds the copy true.
    const explicit = tokensOf("[data-language='console'][data-theme='dark']")
    const fallback = tokensOf(':root:not([data-theme])')
    expect(Object.keys(explicit).length).toBeGreaterThan(30)
    const disagreeing = Object.keys(explicit)
      .filter((k) => explicit[k] !== fallback[k])
      .sort()
    expect(
      disagreeing,
      'these differ between the explicit dark block and the prefers-color-scheme fallback, ' +
        'so dark renders differently depending on whether a theme was chosen',
    ).toEqual([])
    expect(Object.keys(fallback).filter((k) => explicit[k] === undefined).sort()).toEqual([])
  })
  /**
   * **The document names the language; the app does not get a vote.**
   *
   * `useGround` wrote `dataset.language = 'console'` in a mount effect, so the
   * language axis did not survive mount: a document declaring a second
   * language painted one frame and was reverted. Invisible while one language
   * shipped, because the value it reverted to was the value it replaced.
   *
   * **Scoped to `src`, which is what ships.** `.storybook/preview.tsx` writes
   * the attribute on purpose and must: Storybook serves its own document with
   * no `data-language` on it, and the toolbar control is how a story is seen
   * in a language at all. A writer *inside* the app has no such document to
   * stand in for.
   *
   * Deleting the attribute is caught too. `tokens.css` opens the light and
   * dark blocks as `:root, [data-language='console']`, so an absent attribute
   * still paints -- which is exactly why a writer that removed it would be as
   * silent as the one that overwrote it.
   */
  it('is never written by the app itself', () => {
    expect(SOURCE.length).toBeGreaterThan(200)
    const writers = SOURCE.filter(({ text }) =>
      /(?:dataset\.language\s*=)|(?:setAttribute\(\s*['"`]data-language)|(?:removeAttribute\(\s*['"`]data-language)|(?:delete\s+[^\n;]*dataset\.language)/.test(
        text,
      ),
    )
    expect(
      writers.map(({ path }) => path.slice(path.lastIndexOf(`${sep}src${sep}`))).sort(),
      'the language is the document\'s: a writer here reverts whatever index.html declared',
    ).toEqual([])
  })

  /**
   * **A language overrides `:root` on source order alone, and nothing said so.**
   *
   * `:root` and `[data-language='x']` both compute to specificity 0-1-0, so the
   * language wins only by appearing later in the file. The failure of getting
   * it wrong is the bad kind: a block inserted above `:root` still overrides
   * every colour, because those live in `:root, [data-language='console']` and
   * a later language block beats both -- while its radii, control heights and
   * type scale are silently ignored, since those are declared in the `:root`
   * block above it. Half a language, which reads as a language with a few
   * measures it forgot to set.
   *
   * Anchored on `--radius-xs`, which is the first declaration of the geometry
   * block and moves only if that block does.
   */
  it('imports the geometry a language overrides before the language', () => {
    /**
     * **Same specificity, so order decides it.** A `[data-language]` block and
     * the `:root` scale it overrides carry equal weight, and the scale now sits
     * in its own file -- so what used to be a position within one stylesheet is
     * an import order in `index.css`. Reversed, a language's colours would
     * apply and its measures would not, which is the half-applied state this
     * has always been about.
     */
    const entry = readFileSync(join(HERE, 'index.css'), 'utf8')
    const scale = entry.indexOf("@import './scale.css'")
    const ground = entry.indexOf("@import './ground.css'")
    expect(scale, 'index.css imports no scale').toBeGreaterThan(-1)
    expect(ground, 'index.css imports no ground').toBeGreaterThan(-1)
    expect(scale, 'the scale must be imported before the grounds').toBeLessThan(ground)

    // And the languages really are in the file this checks the order of.
    const languages = [...TOKENS.matchAll(/\[data-language='([^']+)'\]/g)]
    expect(languages.length).toBeGreaterThan(0)
  })
})
