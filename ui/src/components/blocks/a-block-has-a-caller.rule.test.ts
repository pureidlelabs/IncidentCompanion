import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A block the app never mounts is a second door onto behaviour the app
 * already has.** `every-block-has-a-story.rule.test.ts` beside this one asks
 * that a block be visible, and a story satisfies that; this asks that
 * something ship it.
 *
 * **Reachability, not one hop.** A chain answers the one-hop question for
 * itself -- every link has an importer, so only its head reads as orphaned --
 * so the reached set starts outside `blocks/` and grows through block-to-block
 * imports.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', '..')

const isStoryOrTest = (name: string) => /\.(stories|test)\.tsx?$/.test(name)
const isSource = (name: string) => /\.tsx?$/.test(name) && !isStoryOrTest(name)

/**
 * Blocks with no caller, each carrying why it may stay.
 *
 * A ratchet: the list is what was already orphaned when the rule landed, so it
 * stops the next one rather than finding these. Deleting a line is the fix;
 * adding one needs a reason in the commit.
 */
const UNMOUNTED: Readonly<Record<string, string>> = {
  // The picker's pane head, built and not yet reached by a pane.
  // -> `structure.test.ts`'s open findings, which carries it too.
  'pane-head.tsx': 'awaiting the picker panes it was extracted for',
}

function sourcesUnder(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourcesUnder(full, into)
    else if (isSource(entry)) into.push(full)
  }
  return into
}

const SPECIFIER = /(?:from\s+'([^']+)'|import\(\s*'([^']+)')/g

/** The block file names this file imports, by the stem a specifier names. */
function blocksImportedBy(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const stems: string[] = []
  for (const [, from, dynamic] of text.matchAll(SPECIFIER)) {
    const spec = from ?? dynamic ?? ''
    const stem =
      /(?:^|\/)blocks\/([^/]+)$/.exec(spec)?.[1] ??
      (dirname(file) === HERE ? /^\.\/([^/]+)$/.exec(spec)?.[1] : undefined)
    if (stem !== undefined) stems.push(stem)
  }
  return stems
}

describe('a block has a caller', () => {
  const blocks = readdirSync(HERE).filter(isSource)
  const stems = new Map(blocks.map((name) => [name.replace(/\.tsx?$/, ''), name]))
  const outside = sourcesUnder(SRC).filter((file) => dirname(file) !== HERE)

  const reached = new Set<string>()
  for (const file of outside) {
    for (const stem of blocksImportedBy(file)) {
      const name = stems.get(stem)
      if (name !== undefined) reached.add(name)
    }
  }
  // Through the tier: a block a reached block imports is shipped too.
  for (let grew = true; grew; ) {
    grew = false
    for (const name of [...reached]) {
      for (const stem of blocksImportedBy(join(HERE, name))) {
        const next = stems.get(stem)
        if (next !== undefined && !reached.has(next)) {
          reached.add(next)
          grew = true
        }
      }
    }
  }

  it('finds blocks and callers to read', () => {
    expect(blocks.length).toBeGreaterThan(20)
    expect(outside.length).toBeGreaterThan(100)
    expect(reached.size).toBeGreaterThan(20)
  })

  it('mounts every block from outside the tier', () => {
    const unmounted = blocks
      .filter((name) => !reached.has(name) && !(name in UNMOUNTED))
      .sort()
    expect(
      unmounted,
      'nothing outside this tier reaches these, so only their own stories and ' +
        'tests keep them green -- mount them from a screen, or delete them ' +
        'with everything that was built for them',
    ).toEqual([])
  })

  // Or the list rots, and the next stale line is indistinguishable from it.
  it('lists nothing that has since been mounted or deleted', () => {
    const stale = Object.keys(UNMOUNTED).filter(
      (name) => !blocks.includes(name) || reached.has(name),
    )
    expect(stale, 'these are no longer unmounted -- delete them from UNMOUNTED').toEqual([])
  })
})
