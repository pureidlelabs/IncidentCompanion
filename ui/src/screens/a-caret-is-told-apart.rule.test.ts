import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { caretIdentity } from '@/components/blocks/presence'

/**
 * Every collaborative body names its writer with a colour of their own.
 *
 * **The presence argument is optional, so forgetting it is silent.**
 * `useProseSync` takes `{ name, color? }`; without the colour every peer is
 * drawn in the editor's default, and two analysts in one report cannot tell
 * which caret is theirs. The notes screen derived a colour and the report
 * screen did not, because the deriving function was private to the file that
 * had it. -> #414
 *
 * **Searched rather than listed.** A hardcoded pair of paths is a snapshot of
 * today's call sites, and the defect is a *third* screen opening a document
 * and forgetting -- which a list cannot see.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

function filesUnder(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') found.push(...filesUnder(full))
      continue
    }
    if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) found.push(full)
  }
  return found
}

/** Every file that opens a document, with its text. */
function callers(): { path: string; text: string }[] {
  return filesUnder(SRC)
    .map((full) => ({ path: relative(SRC, full), text: readFileSync(full, 'utf8') }))
    .filter(({ path, text }) => text.includes('useProseSync(') && !path.startsWith('api/'))
}

describe('a caret can be told from another', () => {
  it('finds the screens this is written about', () => {
    // A zero here would make every assertion below pass over nothing.
    expect(callers().length, 'no screen opens a document any more').toBeGreaterThanOrEqual(2)
  })

  it('builds every writer identity through the shared derivation', () => {
    // The call, not the import: a screen that imports `caretIdentity` and then
    // hands the hook a bare name satisfies a check for the name alone.
    const forgot = callers()
      .filter(({ text }) => !text.includes('caretIdentity('))
      .map((one) => one.path)
    expect(
      forgot,
      'this screen opens a document without naming its writer, so every caret draws alike',
    ).toEqual([])
  })

  it('hands the hook no identity built by hand', () => {
    const byHand = callers()
      .filter(({ text }) => /\{\s*name:\s*\w+\s*\}/.test(text))
      .map((one) => one.path)
    expect(byHand, 'this identity carries a name and no colour').toEqual([])
  })

  it('gives two analysts two colours, which is the point of deriving one', () => {
    // **The trap the first fix fell into.** `caretColor` short-circuits on
    // `you` to `--primary` before it reads the name, so `caretIdentity` asking
    // as yourself handed every analyst the same colour and nothing could be
    // told apart -- the exact defect #414 is about, passing its own review.
    //
    // Not literal colours: `tokens.test.ts` refuses one anywhere under `src`,
    // and what this asserts is that the tones differ rather than what they are.
    document.documentElement.style.setProperty('--primary', 'yours')
    for (let at = 1; at <= 8; at += 1) {
      document.documentElement.style.setProperty(`--presence-${String(at)}`, `tone-${String(at)}`)
    }

    const tones = new Set(
      ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Ken'].map((name) => caretIdentity(name).color),
    )
    expect(tones.size, 'every analyst published one colour').toBeGreaterThan(1)
    expect(tones, 'the caret is published as your own colour, which peers all share').not.toContain(
      'yours',
    )
  })
})
