import { readFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A screen is a layout, blocks for the geometry, and the last small things.**
 *
 * That is the whole recipe. The layout is the backbone -- the rail, the shell,
 * the frame. The blocks are the geometry. A kit component appears at this tier
 * only for something specific to this one page and reused nowhere.
 *
 * Two ways a screen breaks it, and neither is visible in a green suite.
 *
 * - **It wires primitives into geometry.** A screen importing ten kit modules
 *   is not composing, it is building -- and what it builds is a shape twenty
 *   other screens also build, separately, so a change to any of them reaches
 *   one file. `data-table`, `table-toolbar`, `bulk-actions`, `filter-bar` and
 *   `empty-state` are all already blocks; the collection shape
 *   they make is not, which is why it is written out once per screen.
 * - **It reaches sideways to another screen.** `screens.rule.test.ts` governs
 *   which *tiers* a screen may import and permits a relative path inside this
 *   one, so a screen importing a sibling passes it. Taking a piece out of a
 *   neighbour makes that neighbour a library: neither can then be read, moved
 *   or deleted on its own. A thing two screens share is a block.
 *
 * `KIT_CEILING` is what "the last small things" means as a number, and there
 * is no exemption list: an exemption written while the list is long is a lane
 * rather than a decision.
 *
 * ## What it reads, and what it cannot
 *
 * It counts *modules*, not names, so a compound import (`Alert`,
 * `AlertTitle`, `AlertDescription`) counts once -- those are one component's
 * parts and punishing them would push screens toward worse markup to satisfy a
 * rule. It cannot tell a legitimate one-off from geometry, which is the
 * judgement the recipe leaves to a reader.
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * The most kit modules a screen reaches for before it is building rather than
 * composing.
 *
 * Four: a screen is entitled to the one or two controls that exist only on it,
 * with room to spare. Past that the shape being assembled is one some other
 * screen also assembles.
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
 *
 * **Against the tier's own file list, not against every relative path.** The
 * directory also holds `.ts` modules a screen legitimately keeps beside it --
 * `case-paths`, `cascade-rows`, a shortcut registry -- and counting those made
 * the first cut of this rule name 29 screens, most of them innocent.
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
   *
   * **One screen reaching for a part of its own is not that.** The harm this
   * names is a file becoming a library nobody declared -- read, moved and
   * deleted only together with its caller. That happens the moment a second
   * screen imports it, and not before: a part with a single caller is that
   * screen's body, which is what `ui-design` calls the difference between a
   * block and a screen.
   *
   * So the count is the rule. A part reached twice belongs in `blocks/`; the
   * message says so, and names both callers.
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
