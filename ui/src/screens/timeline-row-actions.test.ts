import { describe, expect, it } from 'vitest'

import type { CollectionName, TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { referenceOptions } from '@/components/blocks/entity-scope'
import { NO_TIMELINE_FILTER, timelineRowActions, type TimelineFilter } from './timeline-entries'

/**
 * What a timeline row offers, and what the create dialog can offer back.
 *
 * **Written as an attack on the menu's own rule**: every item names a value
 * the row holds, and a value already in the filter offers nothing. A menu with
 * dead items in it teaches an analyst to stop opening menus, and both failures
 * -- an item for a field the row leaves empty, an item that would change
 * nothing -- render as a perfectly ordinary menu.
 *
 * The story tier cannot see either. A story asserts that the screen rendered.
 */

const events = campaignCase.timeline.filter((entry) => entry.kind === 'event')
const activities = campaignCase.timeline.filter((entry) => entry.kind === 'action')

/** Every item id the menu offers, flattened out of its groups. */
function ids(entry: TimelineEntry, filter: TimelineFilter = NO_TIMELINE_FILTER): string[] {
  return timelineRowActions(entry, { filter, editable: true, deletable: true }).flatMap((group) =>
    group.map((item) => item.id),
  )
}

function labels(entry: TimelineEntry, filter: TimelineFilter = NO_TIMELINE_FILTER): string[] {
  return timelineRowActions(entry, { filter, editable: true, deletable: true }).flatMap((group) =>
    group.map((item) => item.label),
  )
}

describe('what a row offers', () => {
  it('offers no severity narrowing on an activity, which has no severity', () => {
    const activity = activities[0]
    if (!activity) throw new Error('the demo case has no activity')

    expect(ids(activity)).not.toContain('filter-severity')
    // And an event of the same case does offer it, so the absence above is the
    // kind and not an empty demo.
    const rated = events.find((entry) => (entry.severity ?? '').trim())
    if (!rated) throw new Error('the demo case has no rated event')
    expect(ids(rated)).toContain('filter-severity')
  })

  /**
   * **The demo case cannot hold this clause up on its own, measured.**
   * Deleting the `isEvent` guard beside `severity` leaves this file green: no
   * activity in the fixture carries a severity, so the field is absent and the
   * item is dropped for the wrong reason. What the guard is for is a row that
   * *does* carry one -- the server projects each kind through its own schema,
   * so a stray value is a wire question rather than an impossible one.
   */
  it('offers no severity narrowing on an activity that carries a severity anyway', () => {
    const activity = activities[0]
    if (!activity) throw new Error('the demo case has no activity')
    const stray = { ...activity, severity: 'high' } as unknown as TimelineEntry

    expect(ids(stray)).not.toContain('filter-severity')
  })

  it('names the value rather than the field', () => {
    const rated = events.find((entry) => (entry.severity ?? '').trim().toLowerCase() === 'high')
    if (!rated) throw new Error('the demo case has no high event')

    expect(labels(rated)).toContain('Filter to high')
  })

  /**
   * The one that a count would miss: a filter already holding the value must
   * drop the item, not draw it greyed. Both look like a working menu.
   */
  it('drops a narrowing the filter already holds', () => {
    const rated = events.find((entry) => (entry.severity ?? '').trim())
    if (!rated) throw new Error('the demo case has no rated event')
    const severity = (rated.severity ?? '').trim().toLowerCase()

    const already: TimelineFilter = { ...NO_TIMELINE_FILTER, severities: [severity] }

    expect(ids(rated)).toContain('filter-severity')
    expect(ids(rated, already)).not.toContain('filter-severity')
  })

  it('sets the value it names, leaving the rest of the filter alone', () => {
    const phased = events.find((entry) => entry.ukcPhase.trim())
    if (!phased) throw new Error('the demo case has no phased event')
    const filter: TimelineFilter = { ...NO_TIMELINE_FILTER, q: 'graph', kind: 'event' }

    const item = timelineRowActions(phased, { filter, editable: true, deletable: true })
      .flat()
      .find((one) => one.id === 'filter-phase')
    if (item?.kind !== 'filter') throw new Error('no phase narrowing on a phased row')

    expect(item.next.phases).toEqual([phased.ukcPhase.trim()])
    expect(item.next.q).toBe('graph')
    expect(item.next.kind).toBe('event')
    // The filter it came from is untouched: a menu item is a description, and
    // a mutated filter would narrow the list before anybody chose anything.
    expect(filter.phases).toEqual([])
  })

  it('offers no copy for a row with no technique', () => {
    const bare = campaignCase.timeline.find((entry) => !(entry.technique ?? '').trim())
    if (!bare) throw new Error('every demo row carries a technique')

    expect(ids(bare)).not.toContain('copy-technique')
  })

  it('says which way the review flag will move', () => {
    const entry = events[0]
    if (!entry) throw new Error('the demo case has no event')

    const unreviewed = { ...entry, unreviewed: true }
    const reviewed = { ...entry, unreviewed: false }

    expect(labels(unreviewed)).toContain('Mark reviewed')
    expect(labels(reviewed)).toContain('Mark unreviewed')
    const item = timelineRowActions(unreviewed, {
      filter: NO_TIMELINE_FILTER,
      editable: true,
      deletable: true,
    })
      .flat()
      .find((one) => one.id === 'review')
    if (item?.kind !== 'review') throw new Error('no review item')
    expect(item.unreviewed).toBe(false)
  })

  /** The writing verbs are handler presence, per row, and withheld separately. */
  it('withholds the writing verbs a screen hands down no handler for', () => {
    const entry = events[0]
    if (!entry) throw new Error('the demo case has no event')

    const readOnly = timelineRowActions(entry, {
      filter: NO_TIMELINE_FILTER,
      editable: false,
      deletable: false,
    }).flatMap((group) => group.map((item) => item.id))

    expect(readOnly).not.toContain('edit')
    expect(readOnly).not.toContain('delete')
    expect(readOnly).not.toContain('new-event')
    expect(readOnly).not.toContain('review')
    // The narrowing and the copy are reads, and survive.
    expect(readOnly).toContain('filter-phase')

    const undeletable = ids(entry).filter((id) => id === 'delete')
    expect(undeletable).toEqual(['delete'])
    expect(
      timelineRowActions(entry, {
        filter: NO_TIMELINE_FILTER,
        editable: true,
        deletable: false,
      })
        .flat()
        .map((item) => item.id),
    ).not.toContain('delete')
  })
})

/**
 * What the create and edit dialogs can offer for a reference field.
 *
 * The failure this is written against is silent on screen: a collection with
 * no map renders every chip as "(missing reference)" over a row that exists,
 * and looks identical to a case with no rows of that kind.
 */
describe('the reference options a form is handed', () => {
  const options = referenceOptions(campaignCase)

  it('covers every collection the timeline forms point at', () => {
    // Read off the served spec rather than listed here: a form that grows a
    // seventh reference has to fail this rather than quietly lose its chips.
    const wanted = new Set(
      ['EVENT_FIELDS', 'TIMELINE_ACTION_FIELDS'].flatMap((form) =>
        (specsFixture.forms[form]?.fields ?? [])
          .map((field) => ('ref' in field ? field.ref.collection : undefined))
          .filter((one): one is CollectionName => typeof one === 'string'),
      ),
    )

    expect(wanted.size).toBeGreaterThan(2)
    for (const collection of wanted) {
      expect(options[collection], `${collection} has no options`).toBeDefined()
    }
  })

  it('names each row the way its own screen names it', () => {
    const asset = campaignCase.systems[0]
    const indicator = campaignCase.networkIndicators[0]
    const item = campaignCase.evidence[0]
    if (!asset || !indicator || !item) throw new Error('the demo case is short of rows')

    expect(options.systems?.get(asset.id)).toBe(asset.hostname)
    expect(options.network_indicators?.get(indicator.id)).toBe(indicator.value)
    expect(options.evidence?.get(item.id)).toBe(item.name)
  })

  it('holds every row of a collection, not the first page of one', () => {
    expect(options.systems?.size).toBe(campaignCase.systems.length)
    expect(options.accounts?.size).toBe(campaignCase.accounts.length)
  })
})
