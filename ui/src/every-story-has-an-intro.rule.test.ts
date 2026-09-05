import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A docs page with no intro is a props table and nothing else.**
 *
 * Storybook builds a docs page per component from the JSDoc block directly
 * above `const meta`. A story file without one still builds -- it just opens
 * on a page that says nothing about what the thing is, which is invisible to
 * every check that runs the suite rather than reading the gallery. 100 of 263
 * story files carried no such block until this rule.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

const STORIES = glob.sync(`${SRC}/**/*.stories.tsx`)

/** Whatever comment sits directly above `const meta`, skipping blank lines and `//` ones. */
function commentAboveMeta(text: string): string | undefined {
  const meta = /^const meta\b/m.exec(text)
  if (meta === null) return undefined
  const before = text.slice(0, meta.index).trimEnd()
  const lines = before.split('\n')
  let at = lines.length - 1
  while (at >= 0 && (lines[at]?.trim() === '' || lines[at]?.trim().startsWith('//'))) {
    at -= 1
  }
  return lines[at]
}

describe('every story has an intro', () => {
  it('finds stories to check', () => {
    expect(STORIES.length).toBeGreaterThan(200)
  })

  it('gives every meta a JSDoc block directly above it', () => {
    const bare = STORIES.filter((path) => {
      const comment = commentAboveMeta(readFileSync(path, 'utf8'))
      return comment?.endsWith('*/') !== true
    })
      .map((path) => relative(SRC, path).replaceAll('\\', '/'))
      .sort()

    expect(
      bare,
      'this story has no docs-page intro: a `/** ... */` block directly ' +
        "above `const meta`, one sentence naming what the thing is in the " +
        'interface.',
    ).toEqual([])
  })
})
