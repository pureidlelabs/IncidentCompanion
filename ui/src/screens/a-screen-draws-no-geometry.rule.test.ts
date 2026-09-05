import { readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A screen is a layout, blocks for the geometry, and the last small things.**
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * The most kit modules a screen reaches for before it is building rather than
 * composing.
 */
const KIT_CEILING = 4

const FILES = glob
  .sync(`${HERE}/*.tsx`)
  .filter((path) => !/\.(test|stories)\.tsx$/.test(path))

/** Prose may name a path the code may not import -- this file's own does. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Distinct `@/components/ui/<module>` paths this screen imports. */
function kitModulesIn(text: string): string[] {
  const found = [...withoutComments(text).matchAll(/'@\/components\/ui\/([\w-]+)/g)]
  return [...new Set(found.map((one) => one[1] ?? ''))].sort()
}

/**
 * Sibling *screens* this screen imports.
 */
function screensIn(text: string, self: string, tier: ReadonlySet<string>): string[] {
  const found = [...withoutComments(text).matchAll(/from\s+'\.\/([\w-]+)'/g)]
  return [...new Set(found.map((one) => one[1] ?? ''))]
    .filter((one) => one !== self && tier.has(one))
    .sort()
}

interface Read {
  screen: string
  kit: string[]
  screens: string[]
}

/** Every screen in the tier, by module name, so a relative path can be judged. */
const TIER = new Set(FILES.map((path) => basename(path, '.tsx')))

const SCREENS: Read[] = FILES.map((path) => {
  const text = readFileSync(path, 'utf8')
  const screen = relative(HERE, path)
  return {
    screen,
    kit: kitModulesIn(text),
    screens: screensIn(text, basename(path, '.tsx'), TIER),
  }
})

describe('a screen composes rather than draws', () => {
  it('finds the tier to read', () => {
    expect(SCREENS.length).toBeGreaterThan(20)
  })

  /**
   * The geometry belongs to the blocks, so that one edit reaches every screen
   * that shows that shape rather than the one file it was written in.
   */
  it('takes its geometry from the blocks', () => {
    const building = SCREENS.filter((one) => one.kit.length > KIT_CEILING)
      .map((one) => `${one.screen}: ${String(one.kit.length)} kit modules -- ${one.kit.join(', ')}`)
      .sort()
    expect(
      building,
      `over ${String(KIT_CEILING)} kit modules means this screen is assembling a shape rather ` +
        'than composing one. Move the arrangement into a block and let the ' +
        'screen hand it data and words.',
    ).toEqual([])
  })

  /**
   * A screen is a leaf, and what **two** of them share is a block.
   */
  it('shares no part between two screens', () => {
    const reached = new Map<string, string[]>()
    for (const one of SCREENS) {
      for (const part of one.screens) {
        reached.set(part, [...(reached.get(part) ?? []), one.screen])
      }
    }
    const shared = [...reached]
      .filter(([, callers]) => callers.length > 1)
      .map(([part, callers]) => `${part} <- ${callers.sort().join(', ')}`)
      .sort()
    expect(
      shared,
      'two screens sharing a file makes it a library neither declared: it can ' +
        'be read, moved or deleted only together with both. What they share ' +
        'is a block, so move it to `components/blocks/`.',
    ).toEqual([])
  })
})
