import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createPortal } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Person } from '@/components/blocks/presence'

import { CaseFrame, useCasePane, useCaseRailRow } from './case-frame'

/**
 * The two things a screen may declare from inside the frame, and what the
 * frame does when it declares neither.
 *
 * The frame draws one rail for every section of a case, so anything a screen
 * can reach into it with is also something a screen can take away from the
 * twenty sections that never asked. These read what is left standing.
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

/** A screen that takes the row for `slug` and draws one word in it. */
function Claimant({ slug, word }: { slug: string; word: string }) {
  const row = useCaseRailRow(slug)
  if (row.node === null) return null
  return createPortal(<span>{word}</span>, row.node)
}

describe('the rail row a screen may claim', () => {
  /**
   * The frame is mounted by twenty-one screens and all but one of them say
   * nothing about the rail. A slot that changed the row it is offered on
   * whether or not it was taken would move every one of them.
   */
  it('draws its own row where nothing claims it', () => {
    frame(<div>a section</div>)

    const rail = screen.getByTestId('rail')
    // By its destination, because the group above it is also called Report.
    expect(rail.querySelector('a[href="/report"]')).not.toBeNull()
    expect(rail.querySelector('[data-slot="rail-row-slot"]')).toBeNull()
  })

  /** What the row is for: the screen's own rows, in the case rail's list. */
  it('gives the row to the screen that claims it', async () => {
    frame(<Claimant slug="report" word="the section's own rows" />)

    const rail = await screen.findByTestId('rail')
    const slot = rail.querySelector('[data-slot="rail-row-slot"]')
    expect(slot).not.toBeNull()
    expect(slot?.textContent).toBe("the section's own rows")
    // The item is still one of the rail's own, so the rows sit in the list
    // every other row sits in rather than beside it.
    expect(slot?.parentElement?.getAttribute('data-slot')).toBe('sidebar-menu')
  })

  /**
   * Only a row declared as carrying a sub-rail may be taken. Without that,
   * any screen can name any slug and the section it names disappears from
   * every rail the screen is drawn in - and a missing row is the one defect a
   * rail cannot show you.
   */
  it('refuses a claim on a row that carries no sub-rail', () => {
    frame(<Claimant slug="timeline" word="rows the timeline never asked for" />)

    const rail = screen.getByTestId('rail')
    expect(within(rail).getByText('Timeline')).toBeInTheDocument()
    expect(within(rail).queryByText('rows the timeline never asked for')).toBeNull()
  })
})

/** A screen that asks for a pane inset of its own. */
function Bare({ className }: { className: string }) {
  useCasePane({ className })
  return <div>a section</div>
}

describe('the pane a screen may shape', () => {
  /** The frame's own inset, for the sections that never ask. */
  it('keeps its own inset where nothing shapes it', () => {
    const { container } = frame(<div>a section</div>)

    const pane = container.querySelector('[data-slot="pane-scroll"]')
    expect(pane?.className).toContain('px-6')
    // The vertical half is a token, because the bar that sticks to this pane
    // has to cover exactly this much: a sticky offset is measured from the
    // padding edge, so the padding is a band rows scroll through unless
    // something reaches back over it.
    expect(pane?.className).toContain('py-(--pane-inset-y)')
  })

  /**
   * A screen that fills the pane edge to edge - a document, a graph - against
   * one that brings its own margins.
   */
  it('takes the inset the screen asks for instead', () => {
    const { container } = frame(<Bare className="p-0" />)

    const pane = container.querySelector('[data-slot="pane-scroll"]')
    expect(pane?.className).toContain('p-0')
    expect(pane?.className).not.toContain('px-6')
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
})

describe('the case header', () => {
  /**
   * The frame is mounted by every screen story, and a header that drew an
   * empty stack and a door onto nothing would put two
   * meaningless controls on twenty screens at once.
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
      headerEnd: <button data-slot="a-flyout-trigger">a door</button>,
    })
    const marks = [
      ...headerOf(container).querySelectorAll('[data-testid], [data-slot="a-flyout-trigger"]'),
    ]
      .map((one) => one.getAttribute('data-testid') ?? one.getAttribute('data-slot'))
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
    const pane = container.querySelector('[data-slot="pane-scroll"]')
    expect(pane?.querySelector('[data-testid="presence-stack"]')).toBeNull()
    expect(pane?.querySelector('[data-testid="activity-door"]')).toBeNull()
  })

})

describe('a row reached through another', () => {
  /**
   * The report's sub-rail folds and the entity kinds did not, so one idea had
   * two behaviours depending on whether the registry declared the children or
   * a screen claimed the row -- which is the one difference an analyst must
   * never see.
   */
  it('folds its children away and back', async () => {
    const user = userEvent.setup()
    const { container } = withChrome({ section: 'timeline' })
    const rail = container.querySelector('[data-testid="rail"]')

    expect(within(rail as HTMLElement).getByText('Accounts')).toBeInTheDocument()
    await user.click(within(rail as HTMLElement).getByRole('button', { name: 'Collapse Entities' }))
    expect(within(rail as HTMLElement).queryByText('Accounts')).toBeNull()
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
   * section.** It drew the current section's icon, which made the one place a
   * reader looks to know what they are running change as they navigated -- and
   * an icon from the set every row in the rail draws from says nothing a rail
   * row is not already saying.
   */
  it('draws the product mark in the rail head, whatever the section', () => {
    for (const section of ['timeline', 'report'] as const) {
      const { container, unmount } = withChrome({ section })
      expect(
        container.querySelector('[data-slot="product-mark"]'),
        `the ${section} section's head drew no product mark`,
      ).not.toBeNull()
      unmount()
    }
  })

  /**
   * **The tile's ink, not the mark's own, and this is the half that fails
   * silently.** The head draws the mark on `bg-sidebar-primary`, and
   * `--sidebar-primary` *is* `--primary`, so the mark's own beat group --
   * `text-primary` -- would be the colour it is painted on: 1:1, and the half
   * of the drawing that carries the product's identity simply is not there.
   *
   * Asserting the mark exists does not reach it. That assertion passes with
   * the tone dropped, which is how this was found.
   */
  it('hands the mark the tile`s ink rather than its own', () => {
    const { container } = withChrome({ section: 'report' })

    const mark = container.querySelector('[data-slot="product-mark"]')
    expect(mark, 'the head drew no product mark').not.toBeNull()

    const groups = [...(mark?.querySelectorAll('g') ?? [])].map((one) => one.getAttribute('class'))
    expect(groups.length, 'the mark draws no groups to colour').toBeGreaterThan(0)
    for (const one of groups) {
      expect(one, 'a group keeps its own token, so it paints itself onto the tile').toBe(
        'text-current',
      )
    }
  })
})
