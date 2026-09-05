/**
 * A view over a case is a function of the case, so it cannot fall out of step
 * with it and nobody is asked to keep it.
 *
 * *A view MUST be computed from what the case already holds. An analyst MUST
 * NOT be asked to maintain it, and MUST NOT be able to put it out of step with
 * the case. Nothing a view shows MUST be stored as its own answer where the
 * case already carries what it is derived from.*
 *
 * > #### Scenario: A row is edited
 * > - THEN the views show the change
 * > - AND nothing had to be rebuilt by hand
 *
 * > #### Scenario: An analyst is asked to maintain a view
 * > - THEN they are never asked to fill in what the view shows
 *
 * **Asserted as properties, because the specification's claim has no expected
 * value.** *The view is determined by the case* is not a table of answers; it
 * is that the same case gives the same view, that a case reached by editing
 * and editing back gives the view it started with, and that a case stripped of
 * the rows a view rests on shows nothing. A stored answer satisfies the first
 * and fails the second and third, which is exactly the defect the requirement
 * names -- it goes stale the first time somebody edits the row underneath it.
 *
 * **The kill-chain coverage is the subject** because it is the view furthest
 * from the rows: eighteen phases, the hosts each one names and the assets no
 * phase places, none of which any row carries.
 *
 * **And nobody is asked for it**, which is the second scenario and is checked
 * against every form the application serves rather than against the ones this
 * view happens to read.
 *
 * **What this does not cover:** the other views. Each is its own function and
 * the properties here are about this one; a view added tomorrow is not swept
 * by these cases.
 */
import { describe, expect, it } from 'vitest'

import type { Case, TimelineEntry } from '@/api/model'
import { isSection } from '@/api/specs'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { coverageOf } from './killchain-phases'

const view = (kase: Case) => coverageOf(kase, specsFixture)

/** The answers the view produces, which no row carries and no form may ask for. */
const SHOWS = ['observed', 'unplaced', 'hostTotal', 'thin'] as const

/** Every field name any served form asks an analyst to fill. */
const ASKED_FOR = Object.values(specsFixture.forms).flatMap((form) =>
  form.fields.flatMap((entry) => (isSection(entry) ? [] : [entry.name])),
)

const withPhase = (kase: Case, phase: string): Case => ({
  ...kase,
  timeline: kase.timeline.map((entry, at) =>
    at === 0 ? ({ ...entry, ukcPhase: phase } as TimelineEntry) : entry,
  ),
})

describe('a view over a case', () => {
  it('has something to show on this case, so the cases below are not vacuous', () => {
    const shown = view(campaignCase)
    expect(
      shown.phases.some((phase) => phase.observed),
      'no phase is observed',
    ).toBe(true)
    expect(shown.hostTotal, 'the case names no assets').toBeGreaterThan(0)
    expect(ASKED_FOR.length, 'the served forms ask for nothing').toBeGreaterThan(0)
  })

  it('gives the same answer for the same case', () => {
    expect(
      view(campaignCase),
      'the view differs between two readings of one case, so it is carrying something the ' +
        'case does not',
    ).toEqual(view(campaignCase))
  })

  it('shows the change when a row is edited', () => {
    const before = view(campaignCase)
    const after = view(withPhase(campaignCase, 'exfiltration'))

    expect(
      after,
      'a row was edited and the view is unchanged, so it is a second record of the case ' +
        'rather than a reading of it',
    ).not.toEqual(before)
  })

  it('comes back on its own when the row is edited back', () => {
    const started = view(campaignCase)
    const first = campaignCase.timeline[0]!

    view(withPhase(campaignCase, 'exfiltration'))
    const returned = view(withPhase(campaignCase, first.ukcPhase ?? ''))

    expect(
      returned,
      'the view did not return to what it was when the row did, so an edit left something ' +
        'behind that only a rebuild by hand would clear',
    ).toEqual(started)
  })

  it('shows nothing once the rows it rests on are gone', () => {
    const emptied = view({ ...campaignCase, timeline: [], systems: [] })

    expect(
      emptied.phases.filter((phase) => phase.observed),
      'a phase is still observed on a case holding no timeline, so what the view shows is ' +
        'stored somewhere rather than derived',
    ).toEqual([])
    expect(emptied.hostTotal, 'the view counts assets the case no longer holds').toBe(0)
  })

  it.each(SHOWS)('is never asked of an analyst: %s', (shown) => {
    expect(
      ASKED_FOR,
      `a form asks an analyst to fill in ${shown}, which is what the view derives -- so the ` +
        'two can disagree, and the analyst is maintaining the view',
    ).not.toContain(shown)
  })
})
