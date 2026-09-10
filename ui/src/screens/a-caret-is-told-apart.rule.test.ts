import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every collaborative body names its writer with a colour.
 *
 * **The presence argument is optional, so forgetting it is silent.**
 * `useProseSync` takes `{ name, color? }`; without the colour every peer is
 * drawn in the editor's default, and two analysts in one report cannot tell
 * which caret is theirs. The notes screen derived a colour and the report
 * screen did not, because the deriving function was private to the file that
 * had it. -> #414
 *
 * Structural rather than rendered: the defect is a call site passing less than
 * it could, and jsdom resolves no design token, so a rendered assertion would
 * pass on both screens for the wrong reason.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Every file naming the hook, with its text. */
function callers(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []
  for (const rel of ['screens/notes.tsx', 'screens/report-section.tsx']) {
    found.push({ path: rel, text: readFileSync(join(SRC, rel), 'utf8') })
  }
  return found
}

describe('a caret can be told from another', () => {
  it('has the call sites this is written about', () => {
    // A rename would leave every assertion below passing over nothing.
    for (const { path, text } of callers()) {
      expect(text, `${path} no longer opens a document`).toContain('useProseSync(')
    }
  })

  it('builds every writer identity through one function', () => {
    const bare = callers().filter(({ text }) => /\{\s*name:\s*analyst\s*\}/.test(text))
    expect(
      bare.map((one) => one.path),
      'this screen names its writer without a colour, so every caret draws the same',
    ).toEqual([])
  })

  it('reaches the shared derivation rather than a private copy', () => {
    for (const { path, text } of callers()) {
      expect(text, `${path} does not use the shared caret identity`).toContain('caretIdentity')
    }
  })
})
