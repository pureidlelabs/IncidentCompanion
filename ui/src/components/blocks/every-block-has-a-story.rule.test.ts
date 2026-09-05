import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A block nobody can look at is a block nobody knows exists.**
 *
 * The whole of this tier is browsable in Storybook: a block is judged by
 * scrolling to it, and the only thing that puts it in the sidebar is a story.
 * Two blocks landed without one and were invisible until somebody went looking
 * for them by name.
 *
 * A ratchet, not an audit: it was green the day it was written, so it cannot
 * find a block that was already missing one. It stops the next.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Every block: a `.tsx` in this directory that is not a test, story or rule. */
const isBlock = (name: string) =>
  name.endsWith('.tsx') && !/\.(stories|test|rule\.test)\.tsx$/.test(name)
const storyFor = (name: string) => name.replace(/\.tsx$/, '.stories.tsx')

describe('every block has a story', () => {
  const files = readdirSync(HERE)
  const blocks = files.filter(isBlock)

  it('finds blocks to check', () => {
    expect(blocks.length).toBeGreaterThan(20)
  })

  it('puts every block in the sidebar', () => {
    const unseen = blocks.filter((block) => !files.includes(storyFor(block))).sort()
    expect(
      unseen,
      'these blocks have no story, so they are in the code and not in Storybook',
    ).toEqual([])
  })

  /**
   * **Read, not imported.** An `await import()` of every story module pulls
   * React, the component and the whole kit through Vite once per block. Under
   * load that takes over 20 seconds and fails intermittently, so a real title
   * violation and a busy machine produce the same output -- which is the one
   * thing a rule test may not do. Reading the text is instant and
   * gives the same answer.
   *
   * The pattern allows a type annotation: `const meta: Meta = {` is how the
   * files that cannot satisfy `satisfies Meta<typeof X>` spell it, and a
   * pattern requiring a bare `=` silently skipped all five of them.
   */
  it('titles every story under Blocks or Legacy', () => {
    const wrong: string[] = []
    for (const block of blocks) {
      const text = readFileSync(join(HERE, storyFor(block)), 'utf8')
      const meta = /const meta\b[^=]*=\s*\{([\s\S]*?)\n\}/.exec(text)
      const title = /\btitle:\s*'([^']*)'/.exec(meta?.[1] ?? '')?.[1] ?? ''
      // **A family, and at least one.** `^Blocks/` alone accepts
      // `Blocks/Merge review`, which is what let one block sit outside every
      // family for a day -- the families held only because each author read
      // the titles already there. A block belongs to a family; the family is
      // the middle segment.
      //
      // Not *exactly* three: `Blocks/App shell/Rail/Nav` nests a part inside
      // its family, and a pattern anchored at three segments refuses it.
      if (!/^Blocks\/[^/]+\/.+$/.test(title)) {
        wrong.push(`${block} -> ${title || '(none)'}`)
      }
    }
    expect(
      wrong.sort(),
      'a block story is Blocks/<family>/<name> -- read the titles already ' +
        'there and join one rather than inventing a family or sitting outside ' +
        'them all',
    ).toEqual([])
  })
})
