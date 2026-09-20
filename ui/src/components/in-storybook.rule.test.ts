/**
 * Every kit component, block and screen appears in Storybook.
 *
 * **The story is what makes a file a kit component**, which `CLAUDE.md` states
 * and nothing enforced. A primitive reached for directly is a component nobody
 * documented, nobody gave states to, and nobody can find -- which is how a
 * second `Field` comes to exist beside the one everything imports.
 *
 * **The bar is presence, not richness**, which is the maintainer's call: a
 * documentation-only story counts. A file that renders nothing an analyst sees
 * still owes the gallery an entry, because the gallery is the index of what
 * this interface is built from.
 *
 * **And presence is what the instruments need.** The affordance audit compares
 * a component's stories against its twin's; a file with no story is not
 * measured, it is invisible. A hover reveal that never fires lives in that gap
 * until somebody opens the component by hand.
 *
 * **A ratchet, not an audit.** `WITHOUT_A_STORY` grandfathers what was already
 * missing when this was written, so the check is green the day it lands and
 * refuses the next one. The second assertion is what stops that list becoming
 * a permanent excuse: a name that has since gained a story must be removed
 * from it, so the list can only shrink.
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The directories the gallery indexes, relative to `src/`. Listed, because no
 * property of a directory says whether it holds things an analyst sees: most
 * of `app/` is Containers, which compose a screen rather than drawing one, and
 * the root error boundary that draws its own is the known hole. -> #1029
 *
 * The last two assertions keep this honest: a story outside a root goes red,
 * and so does a root that is not there.
 */
const ROOTS = ['components', 'screens']

/** A component's own story and test files, which are not themselves components. */
const SATELLITE = /\.(stories|test)\.tsx$/

/** Empty, and that is the resting state. A name here may only come back out. */
const WITHOUT_A_STORY = new Set<string>([])

/**
 * Every file under one gallery root, relative to `src/`. A missing root reads
 * as empty rather than throwing: this runs at module scope, where an `ENOENT`
 * collects no tests and silences the assertion written to catch exactly that.
 */
function filesUnder(root: string): string[] {
  if (!existsSync(join(SRC, root))) return []
  return readdirSync(join(SRC, root), { recursive: true }).map(
    (name) => `${root}/${String(name).replaceAll('\\', '/')}`,
  )
}

/** Every file under every gallery root, by its path relative to `src/`. */
const FILES = new Set(ROOTS.flatMap((root) => filesUnder(root)))

/**
 * Everything a gallery root holds, at any depth. Derived rather than listed:
 * a hardcoded tier list leaves whatever it does not name unexamined, and
 * reports that as a pass.
 */
function everyComponent(): string[] {
  return [...FILES]
    .filter((name) => name.endsWith('.tsx') && !SATELLITE.test(name))
    .map((name) => name.replace(/\.tsx$/, ''))
}

/**
 * Whether a component has a story beside it.
 *
 * Answered from the listing rather than by `existsSync`, which says true for a
 * differently cased name on this laptop and false in the merge queue -- and
 * Storybook's own glob is the case-sensitive one.
 */
function hasStory(id: string): boolean {
  return FILES.has(`${id}.stories.tsx`)
}

/** Every directory below a gallery root, relative to `src/`. */
function everyTier(): string[] {
  return ROOTS.filter((root) => existsSync(join(SRC, root))).flatMap((root) =>
    readdirSync(join(SRC, root), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(entry.parentPath, entry.name).slice(SRC.length + 1)),
  )
}

describe('the gallery is the index of what the interface is built from', () => {
  it('gives every kit component and block a story', () => {
    const every = everyComponent()

    expect(every.length, 'nothing was read, so nothing below rejected anything').toBeGreaterThan(200)

    const missing = every
      .filter((id) => !hasStory(id))
      .filter((id) => !WITHOUT_A_STORY.has(id))
      .sort()
    expect(
      missing,
      'these have no story, so they are not in the gallery and no instrument can see them -- ' +
        'a documentation-only story is enough',
    ).toEqual([])
  })

  it('keeps the grandfathered list shrinking, never rotting', () => {
    // Without this the list is a permanent excuse: a component could gain a
    // story and stay named as missing, and the next reader would trust it.
    const fixed = [...WITHOUT_A_STORY].filter((id) => hasStory(id)).sort()
    expect(
      fixed,
      'these now have a story -- remove them from WITHOUT_A_STORY, which may only get shorter',
    ).toEqual([])
  })

  it('reads every directory below a root, not only the root itself', () => {
    // Dropping `blocks/` alone left 101 components unread.
    const every = everyComponent()

    const atTheRoot = readdirSync(join(SRC, 'components'))
      .filter((name) => name.endsWith('.tsx') && !SATELLITE.test(name))
      .map((name) => `components/${name.replace(/\.tsx$/, '')}`)
    expect(atTheRoot.length, 'nothing sits at the root, so this proves nothing').toBeGreaterThan(0)
    expect(every).toEqual(expect.arrayContaining(atTheRoot))

    const tiers = everyTier()
    expect(tiers.length, 'there is no subdirectory, so this proves nothing').toBeGreaterThan(1)
    for (const tier of tiers) {
      expect(
        every.some((id) => id.startsWith(`${tier}/`)),
        `${tier} holds components that nothing here reads`,
      ).toBe(true)
    }
  })

  it('indexes screens as well as components', () => {
    expect(
      everyComponent().some((id) => id.startsWith('screens/')),
      'no screen is in the index, so nothing requires one to have a story',
    ).toBe(true)
  })

  it('answers no for a component with no story beside it', () => {
    // A hasStory that answered true unconditionally would disable the ratchet
    // and leave every other assertion in this file passing.
    expect(hasStory('no-such-component')).toBe(false)
    // And a directory that has gone answers rather than throwing ENOENT.
    expect(hasStory('no-such-tier/no-such-component')).toBe(false)
  })

  it('names every directory a story lives in', () => {
    // The roots are listed, so this is what stops the list going stale: a
    // story written outside one indexes nothing and nobody is told.
    const strays = readdirSync(SRC, { recursive: true })
      .map((name) => String(name).replaceAll('\\', '/'))
      .filter((name) => name.endsWith('.stories.tsx'))
      .filter((name) => !ROOTS.some((root) => name.startsWith(`${root}/`)))
      .sort()
    expect(
      strays,
      'these stories sit outside every gallery root, so nothing requires their neighbours to have one -- add the directory to ROOTS',
    ).toEqual([])
  })

  it('names a root that is there', () => {
    // A misspelled or deleted root would otherwise read as empty, and the
    // stray-story guard above would be reporting on a list nobody maintains.
    const gone = ROOTS.filter((root) => !existsSync(join(SRC, root)))
    expect(gone, 'ROOTS names a directory that is not in the tree').toEqual([])
  })

  it('names only components that exist', () => {
    // A stale entry hides a real absence: delete the file and its exemption
    // silently starts covering nothing.
    const all = new Set(everyComponent())
    expect([...WITHOUT_A_STORY].filter((id) => !all.has(id)).sort()).toEqual([])
  })
})
