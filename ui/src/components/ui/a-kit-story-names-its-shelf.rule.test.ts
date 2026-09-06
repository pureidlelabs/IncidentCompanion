import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A kit story lands on a shelf, and the live shelves are flat.**
 *
 * `Screens/` and `Blocks/<Family>/` are each bound by a rule; the kit's own
 * shelves were held by nothing but every author reading the titles already
 * there. A kit story titled anything at all left the board green while the
 * gallery sidebar grew a heading nobody chose.
 *
 * **Flat is the decision, not an omission.** A block belongs to a family
 * because there are so many of them; the kit is a ladder of primitives an
 * analyst finds by name, so `Components/Button` beats `Components/Form/Button`
 * -- which forces a call about whether a `TokenField` is Form or Input, on a
 * shelf where nobody is looking for either.
 *
 * **A ratchet, not an audit.** Green over every kit story when it was written.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** The shelves a kit story may sit on. */
const SHELVES = new Set(['Components', 'Styling', 'Utilities'])

/** The `title:` of a story's own `meta`, never a `title` inside its fixtures. */
function titleOf(file: string): string {
  const text = readFileSync(join(HERE, file), 'utf8')
  const meta = /const meta\b[^=]*=\s*\{([\s\S]*?)\n\}/.exec(text)
  return /\btitle:\s*'([^']*)'/.exec(meta?.[1] ?? '')?.[1] ?? ''
}

describe('a kit story names its shelf', () => {
  const stories = readdirSync(HERE).filter((name) => name.endsWith('.stories.tsx'))

  it('finds kit stories to read', () => {
    expect(stories.length).toBeGreaterThan(50)
  })

  it('puts every one on a shelf the sidebar has', () => {
    const wrong = stories
      .map((file) => [file, titleOf(file)] as const)
      .filter(([, title]) => !SHELVES.has(title.split('/')[0] ?? ''))
      .map(([file, title]) => `${file} -> ${title || '(none)'}`)
      .sort()

    expect(
      wrong,
      'a kit story on no shelf. Components, Styling or Utilities -- a new ' +
        'shelf is a decision about the gallery, so add it to SHELVES here ' +
        'and say why.',
    ).toEqual([])
  })

  it('keeps the live shelves flat', () => {
    const nested = stories
      .map((file) => [file, titleOf(file)] as const)
      .filter(([, title]) => title.split('/').length !== 2)
      .map(([file, title]) => `${file} -> ${title}`)
      .sort()

    expect(
      nested,
      'a kit story filed under a family. The kit is found by name, not by ' +
        'category -- Shelf/Name, two segments.',
    ).toEqual([])
  })
})
