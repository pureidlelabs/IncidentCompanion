import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **The design language the document declares must be one `tokens.css` speaks,
 * and the two dark sets must agree.**
 */
const HERE = dirname(fileURLToPath(import.meta.url))
/**
 * `tokens.css` with its comments stripped.
 */
const TOKENS = readFileSync(join(HERE, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
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
 * What ships: no test, no story, no fixture.
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
   */
  it('declares every language after the geometry it may override', () => {
    const geometry = TOKENS.indexOf('--radius-xs:')
    expect(geometry).toBeGreaterThan(-1)
    const languages = [...TOKENS.matchAll(/\[data-language='([^']+)'\]/g)]
    expect(languages.length).toBeGreaterThan(0)
    const above = languages
      .filter((match) => match.index < geometry)
      .map((match) => match[1]!)
    expect(
      [...new Set(above)].sort(),
      'these blocks sit above the :root geometry, which is equal specificity -- ' +
        'their colours would apply and their measures would not',
    ).toEqual([])
  })
})
