/**
 * The tiers run one way, and a lower one may not reach up.
 *
 * ```
 *   lib  ->  ui  ->  blocks  ->  screens  ->  app
 * ```
 *
 * A component does one thing and says how it may be used. A block composes
 * components into something a workflow needs, or something reused often enough
 * that one change to it should land everywhere. A screen is how the app looks
 * on a page. A container couples a screen to the exchange.
 *
 * An upward import compiles, renders and tests green, so nothing else in the
 * tree notices it - what it costs is that the lower tier can no longer be
 * read, moved or reused without the higher one. A file that turns out to
 * belong to a higher tier moves there rather than being excused; `ALLOWED`
 * below is for the crossings that are a genuine, cited decision instead.
 *
 * **Where a thing renders is not a rank.** A backbone (`app-shell` and the
 * frames), a pane, and an overlay (a dialog, a popover, a sheet) are all
 * blocks: they differ in which part of the screen they occupy, and that
 * constrains nothing about who may import whom. A block raised over a page is
 * still a block, which is why every dialog lives here. Ranking that axis is
 * what put three overlays in `screens/`.
 *
 * `lib` is the step below this one and has its own rule,
 * `lib/lib-is-shared-and-therefore-pure.rule.test.ts`, because what it may not
 * reach is *anything that renders* rather than one tier up.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Lower may not import higher. */
const RANK: Readonly<Record<string, number>> = {
  ui: 1,
  blocks: 2,
  screens: 3,
  app: 4,
}

/**
 * The crossings that are decisions rather than drift, each with its reason.
 *
 * **A line here is a debt unless it carries a why**, written in the importing
 * file's own docstring: if the reason is not where the next reader will be, it
 * is drift wearing a permission.
 */
const ALLOWED: Readonly<Record<string, string>> = {}

// **Both quote styles.** The vendored files are double-quoted and the app's
// own are single-quoted, so a single-quote pattern is a ratchet that passes
// while the tree violates it -- `ui/src/features/**` carries double-quoted
// `@/features` imports this could not see.
const IMPORT = /from\s+['"]@\/((?:components\/(?:ui|blocks)|screens|app)[^'"]*)['"]/g

function tierOf(spec: string): string | null {
  for (const name of ['ui', 'blocks']) {
    if (spec.startsWith(`components/${name}/`)) return name
  }
  if (spec.startsWith('screens/')) return 'screens'
  return spec.startsWith('app/') ? 'app' : null
}

function sources(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sources(full, into)
    } else if (/\.tsx?$/.test(entry) && !entry.includes('.test.') && !entry.includes('.stories.')) {
      into.push(full)
    }
  }
  return into
}

/** Every import that points up a tier, as `from -> to`. */
function crossings(): string[] {
  const found: string[] = []
  // Every tier the ladder names, not only the two under `components/`. Walking
  // the kit alone left the two steps where a crossing is most tempting - a
  // screen reaching into a container for a helper, a block reaching for a
  // screen - checked by nothing.
  for (const dir of ['components', 'screens', 'app']) {
    for (const file of sources(join(SRC, dir))) {
      const rel = relative(SRC, file).replaceAll('\\', '/')
      const here = tierOf(rel)
      if (here === null) continue
      for (const [, spec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const there = tierOf(spec ?? '')
        if (there === null) continue
        if ((RANK[there] ?? 0) > (RANK[here] ?? 0)) found.push(`${rel} -> ${spec ?? ''}`)
      }
    }
  }
  return [...new Set(found)].sort()
}

describe('the tiers run one way', () => {
  const found = crossings()

  it('finds source to read', () => {
    expect(sources(join(SRC, 'components')).length).toBeGreaterThan(30)
    expect(sources(join(SRC, 'screens')).length).toBeGreaterThan(10)
    expect(sources(join(SRC, 'app')).length).toBeGreaterThan(10)
  })

  /**
   * A lower tier reaching up is what stops it being read, moved or reused on
   * its own - and it is invisible, because it compiles and renders.
   */
  it('adds no crossing that is not a decision', () => {
    const added = found.filter((one) => ALLOWED[one] === undefined)
    expect(
      added,
      'this import points up a tier - move the file to the tier it belongs in, or invert it with a prop',
    ).toEqual([])
  })

  /** A permission nobody is using is a permission nobody re-examines. */
  it('keeps no permission that has stopped being used', () => {
    const stale = Object.keys(ALLOWED).filter((one) => !found.includes(one))
    expect(stale, 'delete these from ALLOWED: the import is gone').toEqual([])
  })
})
