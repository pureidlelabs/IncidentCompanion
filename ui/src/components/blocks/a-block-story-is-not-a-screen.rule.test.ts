import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A block story that mounts `inACase` draws the whole app around the block.**
 */
const HERE = dirname(fileURLToPath(import.meta.url))

describe('a block story is not a screen', () => {
  const stories = readdirSync(HERE).filter((name) => name.endsWith('.stories.tsx'))

  it('finds block stories to read', () => {
    expect(stories.length).toBeGreaterThan(40)
  })

  it('draws no app shell around a block', () => {
    const dressed = stories
      .filter((name) => /\binACase\s*\(/.test(readFileSync(join(HERE, name), 'utf8')))
      .sort()
    expect(
      dressed,
      'these mount the case frame, so the page shows a screen and the block is ' +
        'whatever sits inside it -- take `bareInACase` instead',
    ).toEqual([])
  })
})
