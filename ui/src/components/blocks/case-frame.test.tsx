import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Person } from '@/components/blocks/presence'

import type { PaneInset } from './app-shell'
import { CaseFrame, useCasePane } from './case-frame'

/**
 * The one thing a screen may declare from inside the frame, and what the frame
 * does when it declares nothing.
 *
 * The frame draws one rail for every section of a case, so anything a screen
 * can reach into it with is also something a screen can take away from every
 * section that never asked. These read what is left standing.
 */
function frame(children: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/cases/one/report']}>
      <CaseFrame section="report" caseName="one">
        {children}
      </CaseFrame>
    </MemoryRouter>,
  )
}

/**
 * Almost every screen that mounts the frame says nothing about the rail, and
 * the frame draws every row whether or not one does.
 */
describe('the rail the frame draws', () => {
  it('draws the Report row for a section that says nothing about it', () => {
    frame(<div>a section</div>)

    const rail = screen.getByTestId('rail')
    // By its destination, because the group above it is also called Report.
    expect(rail.querySelector('a[href="/report"]')).not.toBeNull()
  })
})

/** A screen that asks for a pane inset of its own. */
function Bare({ inset }: { inset: PaneInset }) {
  useCasePane({ inset })
  return <div>a section</div>
}

describe('the pane a screen may shape', () => {
  /** The frame's own inset, for the sections that never ask. */
  it('keeps its own inset where nothing shapes it', () => {
    const { container } = frame(<div>a section</div>)

    const pane = container.querySelector('[data-part="pane-scroll"]')
    // Both halves are tokens, because two boxes have to agree about each: a
    // sticky offset is measured from the padding edge, so the vertical inset
    // is a band rows scroll through unless something reaches back over it, and
    // a body that puts its scrollbar in the gutter cancels the horizontal one.
    expect(pane?.className).toContain('px-(--pane-inset-x)')
    expect(pane?.className).toContain('py-(--pane-inset-y)')
    // The third of the pair. A sticky offset is measured from the padding
    // edge, so the pane declares one that cancels the inset above -- and the
    // two only stay in step because something fails when one of them moves.
    expect(pane?.className).toContain('[--sticky-top:var(--pane-sticky-top)]')
  })

  /**
   * A screen that fills the pane edge to edge - a document, a graph - against
   * one that brings its own margins.
   */
  it('takes the inset the screen asks for instead', () => {
    const { container } = frame(<Bare inset="none" />)

    const pane = container.querySelector('[data-part="pane-scroll"]')
    expect(pane?.className).toContain('p-0')
    // The token the pane actually carries. `px-6` is not one of its classes
    // in any state, so asking for its absence passed whatever the pane did.
    expect(pane?.className).not.toContain('px-(--pane-inset-x)')
    // **And the offset goes with it.** An offset left behind cancels an inset
    // that is no longer there, so anything sticky pins that far above the
    // scrollport's edge and loses the difference. -> #306
    expect(pane?.className).toContain('[--sticky-top:0px]')
    expect(pane?.className).not.toContain('[--sticky-top:var(--pane-sticky-top)]')
  })
})

/**
 * **What the case header carries, and where.**
 *
 * The three are true of the case rather than of the section, so they are the
 * frame's rather than each screen's. What is asserted is what a rewrite drops
 * without any screen noticing: which of them is drawn at all, whether the
 * figures are the caller's or the machine's, and the order the marks sit in.
 *
 * jsdom lays nothing out. Document order is readable; position is not, and
 * `e2e/` is where that is asserted.
 */

const ROSTER: readonly Person[] = [
  { name: 'Dev Analyst', you: true },
  { name: 'Joy Okonkwo' },
]

function headerOf(container: HTMLElement): HTMLElement {
  const header = container.querySelector('header')
  if (header === null) throw new Error('the frame drew no header bar')
  return header
}

function withChrome(props: Partial<React.ComponentProps<typeof CaseFrame>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/cases/one/report']}>
      <CaseFrame section="report" caseName="one" {...props}>
        <div>a section</div>
      </CaseFrame>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  // **The rail's folds persist, and jsdom keeps one `localStorage` for the
  // whole file.** A test that collapses Entities leaves it collapsed for
  // every test after it, so what the rail draws depends on the order the
  // suite happened to run in -- which reads as a fix marking the wrong row.
  localStorage.clear()
})

describe('the case header', () => {
  /**
   * The frame is mounted by every screen story, and a header that drew an
   * empty stack and a door onto nothing would put two meaningless controls on
   * every screen at once.
   */
  it('draws no roster and no door where it is given none', () => {
    const { container } = withChrome()
    const header = headerOf(container)
    expect(header.querySelector('[data-testid="presence-stack"]')).toBeNull()
    expect(header.querySelector('[data-testid="activity-door"]')).toBeNull()
  })

  /**
   * **A roster is a list, not a cache.** Somebody who left the case has to
   * leave the stack; a header holding its first roster shows a colleague who
   * closed the tab an hour ago, and every disc still renders.
   *
   * Asserted on the stack's label rather than on the discs: the discs are
   * animated by Motion, which does not run in jsdom, so an exiting one stays in
   * the document. The label is computed from `people` on every render.
   */
  it('drops an analyst who has left the case', () => {
    const { container, rerender } = render(
      <MemoryRouter initialEntries={['/cases/one/report']}>
        <CaseFrame section="report" caseName="one" people={ROSTER}>
          <div>a section</div>
        </CaseFrame>
      </MemoryRouter>,
    )
    expect(
      within(headerOf(container)).getByTestId('presence-stack').getAttribute('aria-label'),
    ).toBe('In this case: Dev Analyst, Joy Okonkwo')

    rerender(
      <MemoryRouter initialEntries={['/cases/one/report']}>
        <CaseFrame section="report" caseName="one" people={ROSTER.slice(0, 1)}>
          <div>a section</div>
        </CaseFrame>
      </MemoryRouter>,
    )
    expect(
      within(headerOf(container)).getByTestId('presence-stack').getAttribute('aria-label'),
    ).toBe('In this case: Dev Analyst')
  })

  /** Source order is the only thing deciding this, and nothing else reads it. */
  it('draws the roster, then the activity door, then the caller`s own trigger', () => {
    const { container } = withChrome({
      people: ROSTER,
      activity: { entries: [] },
      headerEnd: <button data-part="a-flyout-trigger">a door</button>,
    })
    const marks = [
      ...headerOf(container).querySelectorAll('[data-testid], [data-part="a-flyout-trigger"]'),
    ]
      .map((one) => one.getAttribute('data-testid') ?? one.getAttribute('data-part'))
      .filter((id) =>
        id === 'presence-stack' || id === 'activity-door' || id === 'a-flyout-trigger',
      )
    expect(marks).toEqual(['presence-stack', 'activity-door', 'a-flyout-trigger'])
  })

  /**
   * **The chrome is in the header bar, never in the pane.** Drawn in the pane
   * it scrolls away with the section, which is the whole of what "persistent"
   * meant - and it renders identically the moment the page is at the top.
   */
  it('draws the chrome in the header bar rather than in the scrolling pane', () => {
    const { container } = withChrome({
      people: ROSTER,
      activity: { entries: [] },
    })
    const pane = container.querySelector('[data-part="pane-scroll"]')
    expect(pane?.querySelector('[data-testid="presence-stack"]')).toBeNull()
    expect(pane?.querySelector('[data-testid="activity-door"]')).toBeNull()
  })

})

describe('a row reached through another', () => {
  /**
   * One idea, one behaviour: a fold works the same whether the registry
   * declared the children or the case carries them. Two behaviours for the
   * same control is the one difference an analyst must never see.
   */
  it('folds its children away and back', async () => {
    const user = userEvent.setup()
    const { container } = withChrome({ section: 'timeline' })
    const rail = container.querySelector('[data-testid="rail"]')

    expect(within(rail as HTMLElement).getByText('Accounts')).toBeInTheDocument()
    await user.click(within(rail as HTMLElement).getByRole('button', { name: 'Collapse Entities' }))
    expect(within(rail as HTMLElement).queryByText('Accounts')).toBeNull()
  })

  /**
   * **The parent is a section in its own right.** A `deferToChild` keyed on
   * the fold alone is true whenever the group is open, which is its default -
   * so the one row with children becomes the one row that cannot say the
   * analyst is standing on it, and the rail marks nothing at all.
   */
  it('marks the parent row when the parent is the section stood on', () => {
    const { container } = withChrome({ section: 'entities' })
    const edges = container.querySelectorAll('[data-testid="rail-active-edge"]')

    expect(edges).toHaveLength(1)
    expect(edges[0]?.closest('a')?.textContent).toContain('Entities')
  })

  /**
   * The other half, so a fix for the row above cannot pass by marking both.
   * `case-frame.stories.tsx` covers this in the browser; it is here because the
   * pair is one behaviour and a regression would take whichever is cheaper.
   */
  it('leaves the parent unmarked while a child is the section stood on', () => {
    // **A child is a fragment of its parent's page, not a section of its own.**
    // Addressing it as a section names no route, so nothing matches and no row
    // is marked at all -- which reads as the parent being marked rather than as
    // the address being wrong.
    const { container } = withChrome({ section: 'entities', fragment: 'assets' })
    const edges = container.querySelectorAll('[data-testid="rail-active-edge"]')

    expect(edges).toHaveLength(1)
    expect(edges[0]?.closest('a')?.textContent).toContain('Assets')
  })

  /** One fold, on the one row that has children. */
  it('gives a childless row no fold', () => {
    const { container } = withChrome({ section: 'timeline' })
    expect(container.querySelector('[data-testid="rail-fold-entities"]')).not.toBeNull()
    // Timeline has no children, so it keeps its whole width.
    expect(container.querySelector('[data-testid="rail-fold-timeline"]')).toBeNull()
  })

  /**
   * **The head wears the product's mark, and it is the same mark at every
   * section.** Drawing the current section's icon makes the one place a reader
   * looks to know what they are running change as they navigate -- and an icon
   * from the set every row in the rail draws from says nothing a rail row is
   * not already saying.
   */
  it('draws the product mark in the rail head, whatever the section', () => {
    for (const section of ['timeline', 'report'] as const) {
      const { container, unmount } = withChrome({ section })
      expect(
        container.querySelector('[data-part="product-mark"]'),
        `the ${section} section's head drew no product mark`,
      ).not.toBeNull()
      unmount()
    }
  })

  /**
   * **The tile's ink, not the mark's own, and this is the half that fails
   * silently.** The head draws the mark on `bg-rail-active`, and
   * `--rail-active` *is* `--primary`, so the mark's own beat group --
   * `text-primary` -- would be the colour it is painted on: 1:1, and the half
   * of the drawing that carries the product's identity simply is not there.
   *
   * Asserting the mark exists does not reach it. That assertion passes with
   * the tone dropped, which is how this was found.
   */
  it('keeps the mark on its own two tones rather than the tile`s single ink', () => {
    const { container } = withChrome({ section: 'report' })

    const mark = container.querySelector('[data-part="product-mark"]')
    expect(mark, 'the head drew no product mark').not.toBeNull()

    const groups = [...(mark?.querySelectorAll('g') ?? [])].map((one) => one.getAttribute('class'))
    expect(groups.length, 'the mark draws no groups to colour').toBeGreaterThan(1)
    // The lens and the beat are two groups precisely so they differ. One
    // `currentColor` for both is the mark drawn in a single tone, which is what
    // a tile that had already chosen the ink forced.
    expect(new Set(groups).size, 'every group resolved to one colour').toBeGreaterThan(1)
    expect(groups, 'a group took the tile`s ink instead of its own token').not.toContain(
      'text-current',
    )
  })
})

/**
 * The case's reports on the rail, and what each row addresses.
 *
 * Every assertion stands on a section that is **not** Report, which is the half
 * a rail drawn by the report screen satisfies anyway.
 *
 * What this does not reach: that following one of these addresses draws the
 * report. That is the pane's, and `ReportContainer.address.test.tsx` drives it
 * through a real history.
 */
const REPORTS = [
  { id: 'r-one', label: 'Management summary', sentAt: null },
  { id: 'r-two', label: 'Technical appendix', sentAt: '2026-08-19T09:00:00.000Z' },
]

/** The sub-rail, drawn from a section that is not Report. */
function subrailFrom(section: string): HTMLElement {
  const { container } = withChrome({ section, reports: REPORTS })
  const subrail = container.querySelector<HTMLElement>('[data-testid="report-subrail"]')
  if (subrail === null) throw new Error(`the ${section} section drew no report sub-rail`)
  return subrail
}

describe('the reports on the rail', () => {
  it('lists every report from a section that is not Report', () => {
    const subrail = subrailFrom('timeline')

    for (const report of REPORTS) {
      expect(
        within(subrail).queryByText(report.label),
        `the rail lost ${report.label} away from the Report section`,
      ).not.toBeNull()
    }
  })

  /** The door is a top-level act, so it is not behind the section it starts in. */
  it('draws the New report door from a section that is not Report', () => {
    expect(within(subrailFrom('evidence')).queryByText('New report')).not.toBeNull()
  })

  /** A row that acts rather than addressing its report has, from here, no screen to act on. */
  it('addresses each report, so a row from another section opens it', () => {
    const subrail = subrailFrom('timeline')

    for (const report of REPORTS) {
      const row = within(subrail).getByText(report.label).closest('a')
      expect(row, `${report.label} is not a link`).not.toBeNull()
      expect(row?.getAttribute('href')).toContain(`report=${report.id}`)
    }
  })

  /** The command travels on the address, which is what lets the door leave the section. */
  it('addresses the New report door at the section that owns the dialog', () => {
    const door = within(subrailFrom('timeline')).getByText('New report').closest('a')

    expect(door?.getAttribute('href')).toContain('do=new-report')
  })

  /** Sent is `sentAt`, and the rail is the third screen that has to agree on it. */
  it('says which reports have been sent', () => {
    expect(within(subrailFrom('timeline')).getAllByText('Sent')).toHaveLength(1)
  })

  /** The frame's own `counts` are the attention tally, which carries no report key. */
  it('keeps the report count on the row from another section', () => {
    const { container } = withChrome({ section: 'timeline', reports: REPORTS })
    const row = container.querySelector('[data-testid="rail-report-index"]')

    expect(row?.textContent, 'the Report row lost its count away from the section').toContain(
      String(REPORTS.length),
    )
  })

  /**
   * The row is a destination as well as a fold, and it is current only on the
   * index. A rail marking Report while the analyst stands on the timeline is
   * worse than one marking nothing.
   */
  it('marks no report row from another section', () => {
    // **Both states, because each guards a different row.** With no report
    // named the index row is the candidate; with one named it is that report's
    // row. A case asserting only one leaves the other's guard free to go.
    for (const openReport of [null, REPORTS[0]?.id ?? null]) {
      const { container, unmount } = withChrome({
        section: 'timeline',
        reports: REPORTS,
        openReport,
      })
      const rail = container.querySelector('[data-testid="rail"]')
      const marked = [...(rail?.querySelectorAll('[data-testid="rail-active-edge"]') ?? [])].map(
        (edge) => edge.closest('a')?.getAttribute('data-testid') ?? '',
      )

      expect(
        marked.filter((id) => id.startsWith('rail-report-')),
        `standing on the timeline with openReport=${String(openReport)}`,
      ).toEqual([])
      unmount()
    }
  })

  /**
   * **Only this section's parameters travel.** Arriving from a section that
   * keeps state on the address -- the timeline's phase, the graph's highlight
   * -- a row seeding its query from what is on screen writes that parameter
   * into the report's address, where nothing reads it and every later write
   * preserves it. The fragment was already dropped, so keeping the query was
   * the two halves disagreeing.
   */
  it('carries no parameter from the section it was drawn on', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/cases/one/timeline?phase=exploitation']}>
        <CaseFrame section="timeline" caseName="one" reports={REPORTS}>
          <div>a section</div>
        </CaseFrame>
      </MemoryRouter>,
    )
    const row = container.querySelector(`[data-testid="rail-report-${REPORTS[0]?.id ?? ''}"]`)

    expect(row?.getAttribute('href')).not.toContain('phase')
    expect(row?.getAttribute('href')).toContain(`report=${REPORTS[0]?.id ?? ''}`)
  })

  /** The same parameter is the section's own once the analyst is standing on it. */
  it('keeps the section`s own parameters when it is the one on screen', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/cases/one/report?highlight=ada']}>
        <CaseFrame section="report" caseName="one" reports={REPORTS}>
          <div>a section</div>
        </CaseFrame>
      </MemoryRouter>,
    )
    const row = container.querySelector(`[data-testid="rail-report-${REPORTS[0]?.id ?? ''}"]`)

    expect(row?.getAttribute('href')).toContain('highlight=ada')
  })

  /**
   * A stale link and a deliberate return to the index put the same screen in the
   * pane, so the rail owes the same answer for both: marking by the id asked for
   * leaves the index drawn with no row marked at all.
   */
  it('marks the Report row when the open id names no report of the case', () => {
    const { container } = withChrome({
      section: 'report',
      reports: REPORTS,
      openReport: 'a-report-this-case-does-not-have',
    })

    expect(container.querySelector('[data-testid="rail-report-index"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  /**
   * The converse, so the fix is not "mark it always": a document open is the
   * one state where the parent row is not the current one.
   */
  it('leaves the Report row unmarked while one of its reports is open', () => {
    const open = REPORTS[0]
    expect(open).toBeDefined()
    if (open === undefined) return

    const { container } = withChrome({ section: 'report', reports: REPORTS, openReport: open.id })

    expect(container.querySelector('[data-testid="rail-report-index"]')).not.toHaveAttribute(
      'aria-current',
    )
    expect(container.querySelector(`[data-testid="rail-report-${open.id}"]`)).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
