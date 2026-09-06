/**
 * The two graph screens' doors and viewport controls, attacked.
 *
 * A picture with no way out of it is the failure: a coverage table whose point
 * is which phases rest on evidence, with no route to the evidence; and a canvas
 * with no zoom, no time cursor and no way to reach the record a node stands
 * for.
 *
 * **The attacks are the spellings, not the intentions.** A phase name holds an
 * `&`, so an unencoded pivot silently drops half the query; a cloud app's
 * scope is `cloud-apps` while its kind is `cloud_app`, so a fragment built
 * from the kind opens the entities page on the wrong table; and a zoom with no
 * clamp walks the drawing off
 * its own box after enough presses rather than on the first one.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { Case } from '@/api/model'
import { buildIncidentGraph, heldBackAt } from '@/components/blocks/incident-graph'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { InvestigationGraphScreen } from './investigation-graph'
import { KillchainCoverageScreen } from './killchain-coverage'
import { EMPTY_CAMPAIGN } from './timeline-entries'

/** The query a link carries, as pairs. Parsed, never string-matched: an
 *  unencoded `&` reads correctly in the raw href and splits into two params. */
function queryOf(href: string): [string, string][] {
  return [...new URL(href, 'https://ic.invalid').searchParams]
}

/** The path a link points at, without its query. */
function pathOf(href: string): string {
  return new URL(href, 'https://ic.invalid').pathname
}

/** Which kind the entities page opens on. Empty for a section of its own. */
function hashOf(href: string): string {
  return new URL(href, 'https://ic.invalid').hash
}

describe('the kill chain phase pivot', () => {
  /** Every data row, paired with the phase it names and the state it reports. */
  function rows() {
    return screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => {
        // The first column is the row's header, not a gridcell - reading it as
        // one takes the State column and every phase reads as `not observed`.
        const cells = within(row).getAllByRole('gridcell')
        return {
          row,
          // The leading digits are the phase's number in the chain, drawn in
          // an `aria-hidden` pip that `textContent` still carries.
          phase: within(row).getByRole('rowheader').textContent.replace(/^\d+/, '').trim(),
          state: (cells[0]?.textContent ?? '').trim(),
        }
      })
  }

  it('opens the entries behind an observed phase, and nothing behind an absent one', () => {
    render(<KillchainCoverageScreen kase={campaignCase} specs={specsFixture} />)
    const seen = rows()
    expect(seen.length).toBeGreaterThan(0)

    let observed = 0
    for (const { row, phase, state } of seen) {
      const doors = within(row).queryAllByRole('link')
      if (state === 'observed') {
        observed += 1
        // A phase with evidence gets exactly one door, and it is the name.
        expect(doors, `no pivot on ${phase}`).toHaveLength(1)
        expect(doors[0]?.textContent).toBe(phase)
      } else {
        // Nothing to go and look at: a door here lands on an empty list and
        // reads as the analyst's filter being wrong.
        expect(doors, `${phase} has no entries and offers a door`).toHaveLength(0)
      }
    }
    expect(observed, 'no observed phase in the fixture').toBeGreaterThan(0)
  })

  it("carries that row's own phase, encoded, and nothing else", () => {
    render(<KillchainCoverageScreen kase={campaignCase} specs={specsFixture} />)
    let ampersand = 0

    for (const { row, phase, state } of rows()) {
      if (state !== 'observed') continue
      const href = within(row).getByRole('link').getAttribute('href') ?? ''
      if (phase.includes('&')) ampersand += 1

      expect(pathOf(href)).toBe(`/cases/${campaignCase.id}/timeline`)
      // One pair, and the value is this row's phase whole. `command & control`
      // unencoded parses as `step=command ` plus a second empty parameter.
      expect(queryOf(href)).toEqual([['step', phase]])
    }

    expect(ampersand, 'no phase with an & in it, so the encoding is untested').toBeGreaterThan(0)
  })
})

/**
 * **The viewport's four properties are not held here any more, and nothing
 * quietly covers them.**
 *
 * They were assertions on the stand-in's `viewBox`: opens on the whole
 * drawing, zooms about the middle rather than a corner, stops at both ends
 * rather than inverting the box, and comes back on Fit. The drawing is
 * Cytoscape over a `<canvas>` now, so there is no box to read and no element
 * to find -- and every one of the four is a decision `components/ui/graph-canvas.tsx`
 * makes: `zoomBy` passes the pane's centre as `renderedPosition`, and
 * `minZoom`/`maxZoom` are what stop it at the ends.
 *
 * Exercising them needs a live engine, which jsdom cannot give: Cytoscape
 * measures a container that is 0x0 there and renders nothing. So they belong
 * to the browser tier, and are written down here rather than deleted in
 * silence, because a screen that zooms off its own drawing looks exactly like
 * one nobody thought to test.
 */

describe('the investigation graph time cursor', () => {
  /**
   * **Held against the model, not the drawing.** Cytoscape paints to a
   * `<canvas>`, so the dimmed nodes the analyst sees are pixels and no query
   * reaches them. `heldBackAt` is the decision behind every one of them, and
   * the graph is what it is applied to -- so these hold the whole property and
   * nothing about how it is painted.
   *
   * What they cannot see: that the class is applied at all, and that `.unseen`
   * paints anything. `blocks/incident-canvas.stories.tsx` shows it, and
   * the `visual-check` skill is how it is judged.
   */
  function heldBack(kase: Case, cursor: number | null): string[] {
    const graph = buildIncidentGraph(kase, specsFixture)
    return graph.nodes
      .filter((node) => heldBackAt(node.seen, cursor))
      .flatMap((node) => (node.paintedBy ? [node.paintedBy.id] : []))
  }

  /** Every entity the drawing paints, dim or not. */
  function painted(kase: Case): string[] {
    return buildIncidentGraph(kase, specsFixture).nodes.flatMap((node) =>
      node.paintedBy ? [node.paintedBy.id] : [],
    )
  }

  /** The moment of the case's earliest stamped entry. */
  function opensAt(kase: Case): number {
    const stamped = kase.timeline
      .map((entry) => Date.parse(entry.time))
      .filter((at) => Number.isFinite(at))
    return Math.min(...stamped) / 1000
  }

  /** The system the case's earliest and latest stamped entries name. */
  function ends() {
    const stamped = campaignCase.timeline
      .filter((entry) => typeof entry.systemId === 'string' && entry.systemId !== '')
      .slice()
      .sort((left, right) => Date.parse(left.time) - Date.parse(right.time))
    return { first: stamped[0]?.systemId ?? '', last: stamped.at(-1)?.systemId ?? '' }
  }

  it('rests on the whole incident, with nothing held back', () => {
    expect(painted(campaignCase).length).toBeGreaterThan(0)
    expect(heldBack(campaignCase, null)).toEqual([])
  })

  it('holds back what had not happened yet', () => {
    const held = heldBack(campaignCase, opensAt(campaignCase))

    // Neither of the two ways this goes wrong: a cursor that dims the whole
    // drawing says nothing, and one that dims none of it is inert.
    expect(held.length).toBeGreaterThan(0)
    expect(held.length).toBeLessThan(painted(campaignCase).length)

    const { first, last } = ends()
    expect(first).not.toBe(last)
    // An entity is placed at the first entry that names it, never at the case's
    // own start: dating every host from the case start leaves none of them dim.
    expect(held).not.toContain(first)
    expect(held).toContain(last)
  })

  /**
   * The clause a coarser attack leaves standing.
   *
   * Dating an entity from its folded event *kind* rather than from the entry
   * that names it leaves every assertion above green, because the demo's late
   * hosts belong to late kinds anyway. Three entries,
   * two of them folded into one kind by sharing a description, separate the
   * two readings - and under the wrong one a host is on the drawing ten days
   * before anything reached it.
   */
  it("places a host at the entry that named it, not at its kind's start", () => {
    const [first] = campaignCase.timeline
    const hosts = campaignCase.systems
    expect(first).toBeDefined()
    expect(hosts.length).toBeGreaterThan(2)

    const day = 86_400_000
    const start = Date.parse(first!.time)
    const at = (offset: number) => new Date(start + offset).toISOString()
    const late = hosts[1]!.id

    const kase: Case = {
      ...campaignCase,
      timeline: [
        { ...first!, id: 'one', time: at(0), systemId: hosts[0]!.id },
        // Same description, so the drawing folds it into the same node - and a
        // different host, reached ten days later.
        { ...first!, id: 'two', time: at(10 * day), systemId: late },
        // A later kind, so the span outlives either reading of the first.
        {
          ...first!,
          id: 'three',
          description: 'Backup server reimaged after the restore',
          time: at(20 * day),
          systemId: hosts[2]!.id,
        },
      ],
    }

    expect(heldBack(kase, opensAt(kase))).toContain(late)
  })

  // An unstamped moment cannot be shown to have happened by a cursor, and the
  // ways a stamp goes missing are an unmapped import column and a record with
  // no time field at all.
  it('holds back a moment with no stamp on it', () => {
    expect(heldBackAt(Number.NaN, 1)).toBe(true)
    expect(heldBackAt(Number.POSITIVE_INFINITY, 1)).toBe(true)
  })

  it('comes back to the whole incident at the far end', async () => {
    render(<InvestigationGraphScreen kase={campaignCase} specs={specsFixture} />)
    const slider = screen.getByRole('slider', { name: /up to this moment/ })
    slider.focus()
    await userEvent.setup().keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'Show the whole incident' })).toBeInTheDocument()

    slider.focus()
    await userEvent.setup().keyboard('{End}')
    // Dragged to the end is the same state as never having moved it, so the
    // way back is gone rather than sitting there refusing.
    expect(screen.queryByRole('button', { name: 'Show the whole incident' })).toBeNull()
  })

  it('draws no cursor for a case with nothing on a clock', () => {
    // Entries and entities, and not one parseable stamp - an import that
    // arrived with the time column unmapped. The drawing still has nodes, so
    // the absence of the slider is a decision rather than an empty screen.
    const kase = {
      ...campaignCase,
      timeline: campaignCase.timeline.map((entry) => ({ ...entry, time: '' })),
    }
    render(<InvestigationGraphScreen kase={kase} specs={specsFixture} />)

    expect(painted(kase).length).toBeGreaterThan(0)
    // A slider whose ends are the same moment is a control that cannot move.
    expect(screen.queryByRole('slider', { name: /up to this moment/ })).toBeNull()
  })
})

describe('the investigation graph node doors', () => {
  /**
   * The first entity of a kind, as the screen's `selected` prop takes it.
   *
   * **A prop rather than a click**, because the drawing is a `<canvas>` and a
   * node has no element to press. The screen resolves a selection by entity id
   * as well as by drawn node id -- exactly so a caller outside the drawing can
   * name one -- and the door is drawn from what that resolves to, which is the
   * whole of what these hold.
   */
  function firstOfKind(kase: Case, kind: string): string {
    const node = buildIncidentGraph(kase, specsFixture).nodes.find(
      (one) => one.kind === kind && one.paintedBy !== null,
    )
    expect(node, `no ${kind} node drawn`).toBeDefined()
    return node!.paintedBy!.id
  }

  it('opens the record an entity node stands for', () => {
    const { unmount } = render(<InvestigationGraphScreen kase={campaignCase} specs={specsFixture} />)
    expect(screen.queryByRole('link', { name: /^Open in / })).toBeNull()
    unmount()

    const id = firstOfKind(campaignCase, 'system')
    render(<InvestigationGraphScreen kase={campaignCase} specs={specsFixture} selected={id} />)
    const door = screen.getByRole('link', { name: 'Open in Assets' })
    const href = door.getAttribute('href') ?? ''
    expect(pathOf(href)).toBe(`/cases/${campaignCase.id}/entities`)
    // The entity kinds are one page, so the path alone does not say which kind
    // the door opens on.
    expect(hashOf(href)).toBe('#assets')
    // The row, not the screen: a door onto an unfiltered table is a door onto
    // thirty hosts.
    expect(queryOf(href)).toEqual([['highlight', id]])
  })

  it('spells the section rather than the kind', () => {
    // The demo case names no cloud app from any entry, so one is named here:
    // `cloud_app` is the only kind whose slug is not its own spelling, and
    // asserting the trap needs a node of exactly that kind on the drawing.
    const app = campaignCase.cloudApps[0]
    expect(app, 'no cloud app in the fixture').toBeDefined()
    const kase: Case = {
      ...campaignCase,
      timeline: campaignCase.timeline.map((entry, at) =>
        at === 0 ? { ...entry, cloudAppIds: [app!.id] } : entry,
      ),
    }
    render(<InvestigationGraphScreen kase={kase} specs={specsFixture} selected={firstOfKind(kase, 'cloud_app')} />)

    const href = screen.getByRole('link', { name: 'Open in Cloud Apps' }).getAttribute('href') ?? ''
    // `cloud_app` is the reference target; `cloud-apps` is the scope the
    // entities page is addressed by. A fragment built from the kind opens the
    // page on the wrong table, and the page still renders.
    expect(pathOf(href)).toBe(`/cases/${campaignCase.id}/entities`)
    expect(hashOf(href)).toBe('#cloud-apps')
  })

  // An event is a fold over timeline entries rather than a row anywhere, so
  // `paintedBy` is null on one and the door has nothing to point at.
  it('offers no door on an event, which is not a record anywhere', () => {
    const event = buildIncidentGraph(campaignCase, specsFixture).nodes.find(
      (one) => one.kind === 'event',
    )
    expect(event, 'no event node drawn').toBeDefined()
    render(<InvestigationGraphScreen kase={campaignCase} specs={specsFixture} selected={event!.id} />)

    expect(screen.queryByRole('link', { name: /^Open in / })).toBeNull()
  })
})

describe('the investigation graph empty state', () => {
  it('leads to the screen an empty graph is filled from', () => {
    render(<InvestigationGraphScreen kase={EMPTY_CAMPAIGN} specs={specsFixture} />)
    const door = screen.getByRole('link', { name: 'Open the Timeline' })
    expect(pathOf(door.getAttribute('href') ?? '')).toBe(`/cases/${EMPTY_CAMPAIGN.id}/timeline`)
  })
})
