/**
 * **A screen that holds the analyst's place in a case puts it back when they
 * leave that case.**
 *
 * The search box and the filter chips are where the analyst is in *this* case.
 * The section does not remount per case, so a screen that never clears them
 * carries one case's chips onto the next and silently narrows a table by a
 * value the new case may not hold; a screen that clears on the case *object*
 * instead wipes them whenever a colleague writes. `useResetOnCase` is the rule;
 * this is what holds every screen to it. -> #669
 *
 * **A sweep rather than a press.** Driving five different filter controls
 * through jsdom is what a first attempt at this did, and every case in it
 * skipped silently when the press did not land -- so removing the reset from a
 * screen left the whole suite green. What can go wrong here is a screen
 * growing filter state and not being wired up, and that is a fact about the
 * source.
 *
 * **What this does not cover:** that the reset puts back the right thing,
 * which is `lib/case-rows.ts`'s own cases.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Screens whose place in a case is somebody else's to reset. */
const ELSEWHERE = new Set([
  // The picker stands outside a case, so it has none to leave.
  'picker-cases.tsx',
])

describe('a screen holding the analyst place in a case', () => {
  const files = globSync('*.tsx', { cwd: HERE, absolute: true }).filter(
    (path) => !path.endsWith('.test.tsx') && !path.endsWith('.stories.tsx'),
  )

  it('finds the screens at all', () => {
    // Without this the sweep below passes over an empty list, which is what a
    // moved directory looks like from here.
    expect(files.length).toBeGreaterThan(10)
  })

  it('puts it back when the case underneath changes', () => {
    const unwired = files.filter((path) => {
      if (ELSEWHERE.has(relative(HERE, path))) return false
      const text = readFileSync(path, 'utf8')
      // `useFilters` is the chips and `useState(search)` is the box. Either is
      // the analyst's place; a screen with neither has nothing to put back.
      const holds = text.includes('useFilters(') || text.includes('useState(search)')
      return holds && !text.includes('useResetOnCase(')
    })

    expect(
      unwired.map((path) => relative(HERE, path)).sort(),
      'these screens hold a search or a filter and never put it back, so the analyst carries ' +
        'the narrowing of one case onto the next',
    ).toEqual([])
  })
})
