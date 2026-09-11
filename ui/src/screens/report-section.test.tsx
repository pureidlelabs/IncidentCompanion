import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEMO_LAYOUTS, DEMO_TLP } from '@/components/blocks/report-layouts'

import { CaseFrame } from '@/components/blocks/case-frame'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'

import { ReportSectionScreen } from './report-section'

/**
 * Which report the section puts in the pane, and that it draws no backbone of
 * its own.
 *
 * The section resolves one thing - the open report's id - and what the pane
 * draws follows from it: opening the second report must not draw the first,
 * and an id naming nothing must land on the index rather than on an empty
 * document.
 *
 * **What the rail marks is not here.** The reports are rows the frame draws, so
 * their addresses and their marks are `case-frame.test.tsx`'s. -> #518
 *
 * **Mounted in the case frame, because that is the only place it renders.**
 * The screen draws no backbone of its own, so a bare render would be a section
 * with no shell around it.
 *
 * **jsdom lays nothing out**, so this reads which document the pane names and
 * which element holds a row, never where either sits. The geometry is the
 * browser tier's.
 */
function draw({
  openId = null,
  ...props
}: Partial<Parameters<typeof ReportSectionScreen>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[`/cases/${campaignCase.id}/report`]}>
      <EntityCardProvider caseId={campaignCase.id}>
        {/* One id drives both halves, as the address does in the app: the
            frame marks the row and the screen draws the document. */}
        <CaseFrame
          section="report"
          caseName={campaignCase.id}
          reports={props.reports ?? DEMO_REPORTS}
          openReport={openId}
        >
          <ReportSectionScreen
            reports={DEMO_REPORTS}
            blocks={DEMO_BLOCKS}
            kase={campaignCase}
            layouts={DEMO_LAYOUTS}
            markings={DEMO_TLP}
            openId={openId}
            {...props}
          />
        </CaseFrame>
      </EntityCardProvider>
    </MemoryRouter>,
  )
}

describe('which report the section has open', () => {
  /**
   * Every report is the same document with a different name on it, so a
   * section that opened by position rather than by id renders identically
   * until the one named is not the first.
   */
  it('opens the report the id names, not the first one', async () => {
    const second = DEMO_REPORTS[1]
    const first = DEMO_REPORTS[0]
    expect(second).toBeDefined()
    expect(first).toBeDefined()
    if (second === undefined || first === undefined) return

    draw({ openId: second.id })

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: second.label })).toBeInTheDocument()
    })
    // The other report is on the rail and nowhere else: a pane naming both is
    // the index still drawn under an open document.
    expect(screen.queryByRole('heading', { level: 1, name: first.label })).not.toBeInTheDocument()
  })

  /**
   * An id naming no report of this case - a stale link, or a report another
   * analyst removed while this screen was open.
   *
   * The section owes the index here. Falling back to whichever report happens
   * to be first opens a document nobody asked for, under a name they did not
   * press, and it is indistinguishable from having opened the right one.
   */
  it('shows the index when the open id names no report of the case', async () => {
    const first = DEMO_REPORTS[0]
    expect(first).toBeDefined()
    if (first === undefined) return

    draw({ openId: 'a-report-this-case-does-not-have', reports: DEMO_REPORTS, blocks: DEMO_BLOCKS })

    // The index names every report; a document names one and gives it the
    // pane's only level-1 heading.
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: first.label })).not.toBeInTheDocument()
  })
})

describe('the section takes the case frame as its backbone', () => {
  /**
   * A screen drawing its own shell inside the frame that already gave it one
   * renders two rails and two panes, and every one of them looks right on its
   * own - the outer holds the inner, so nothing overlaps and nothing is
   * clipped. It is only countable.
   */
  it('draws no shell and no rail of its own', async () => {
    const { container } = draw()
    await screen.findByTestId('report-subrail')

    expect(container.querySelectorAll('[data-part="pane-scroll"]')).toHaveLength(1)
    expect(screen.getAllByTestId('rail')).toHaveLength(1)
  })

  /**
   * The reports are navigation, so they belong to the rail. Drawn in the pane
   * they are a second list of the same documents, which is the arrangement
   * this section was rebuilt to be rid of.
   */
  it('puts its report rows in the case rail rather than in the pane', async () => {
    const { container } = draw()

    const subrail = await screen.findByTestId('report-subrail')
    const rail = screen.getByTestId('rail')
    const pane = container.querySelector('[data-part="pane-scroll"]')
    expect(pane).not.toBeNull()

    expect(rail.contains(subrail)).toBe(true)
    expect(pane?.contains(subrail)).toBe(false)
  })

  /**
   * The frame's own rail is what every other section shows, and a section that
   * replaced it would be the only place those rows are missing.
   */
  it('keeps the case rail the frame draws', async () => {
    draw()
    const rail = await screen.findByTestId('rail')

    // One row sampled from each rail group, so a group dropped whole is red.
    // `Case notes` is the sample for the Case group.
    for (const label of ['Case overview', 'Timeline', 'Evidence', 'Compliance', 'Case notes']) {
      expect(within(rail).getByText(label)).toBeInTheDocument()
    }
  })
})
