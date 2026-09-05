import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A kit story lands on a shelf, and the live shelves are flat.**
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
