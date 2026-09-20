/**
 * Every kit component and every block appears in Storybook.
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
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const COMPONENTS = join(process.cwd(), 'src', 'components')

/** A component's own story and test files, which are not themselves components. */
const SATELLITE = /\.(stories|test)\.tsx$/

/**
 * Empty, and that is the resting state: every kit component and every block
 * has a story. A name goes in here only when one is added without one, and
 * comes straight back out when it gains it -- the second assertion below is
 * what stops it becoming a permanent excuse.
 */
const WITHOUT_A_STORY = new Set<string>([])

/**
 * Every component under `components/`, by its path relative to that directory,
 * the root included. Derived rather than listed: a hardcoded tier list leaves
 * whatever it does not name unexamined, and reports that as a pass.
 */
function everyComponent(): string[] {
  return readdirSync(COMPONENTS, { withFileTypes: true }).flatMap((entry) => {
    const inside = entry.isDirectory() ? readdirSync(join(COMPONENTS, entry.name)) : [entry.name]
    const prefix = entry.isDirectory() ? `${entry.name}/` : ''
    return inside
      .filter((name) => name.endsWith('.tsx') && !SATELLITE.test(name))
      .map((name) => `${prefix}${name.replace(/\.tsx$/, '')}`)
  })
}

/** Whether a component has a story beside it. */
function hasStory(id: string): boolean {
  return existsSync(join(COMPONENTS, `${id}.stories.tsx`))
}

describe('the gallery is the index of what the interface is built from', () => {
  it('gives every kit component and block a story', () => {
    const every = everyComponent()

    // `COMPONENTS` is built from `process.cwd()`, so a run started anywhere but
    // `ui/` reads an empty directory and every filter below has nothing to
    // reject -- which passes, saying only that nothing was looked at.
    expect(every.length, 'the tiers hold no component at all').toBeGreaterThan(40)

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

  it('examines the components root as well as its subdirectories', () => {
    // The root held a component nothing looked at, because the directories to
    // read were listed by hand.
    const atTheRoot = readdirSync(COMPONENTS)
      .filter((name) => name.endsWith('.tsx') && !SATELLITE.test(name))
      .map((name) => name.replace(/\.tsx$/, ''))
    expect(atTheRoot.length, 'nothing sits at the root, so this proves nothing').toBeGreaterThan(0)
    expect(everyComponent()).toEqual(expect.arrayContaining(atTheRoot))
  })

  it('names only components that exist', () => {
    // A stale entry hides a real absence: delete the file and its exemption
    // silently starts covering nothing.
    const all = new Set(everyComponent())
    expect([...WITHOUT_A_STORY].filter((id) => !all.has(id)).sort()).toEqual([])
  })
})
