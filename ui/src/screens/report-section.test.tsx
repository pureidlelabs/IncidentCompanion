import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEMO_LAYOUTS, DEMO_TLP } from '@/components/blocks/report-layouts'

import { CaseFrame } from '@/components/blocks/case-frame'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'

import { ReportSectionScreen } from './report-section'

/**
 * Which report the section has open, where its rows land, and what the rail
 * marks current.
 */
function draw(props: Partial<Parameters<typeof ReportSectionScreen>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={[`/cases/${campaignCase.id}/report`]}>
      <EntityCardProvider caseId={campaignCase.id}>
        <CaseFrame section="report" caseName={campaignCase.id}>
          <ReportSectionScreen
            reports={DEMO_REPORTS}
            blocks={DEMO_BLOCKS}
            kase={campaignCase}
            layouts={DEMO_LAYOUTS}
            markings={DEMO_TLP}
            {...props}
          />
        </CaseFrame>
      </EntityCardProvider>
    </MemoryRouter>,
  )
}

describe('which report the section has open', () => {
  /**
   * Every rail row is the same control with a different name on it, so a
   * section that opened by position rather than by id renders identically
   * until the row pressed is not the first one.
   */
  it('opens the report whose row was pressed, not the first one', async () => {
    const second = DEMO_REPORTS[1]
    const first = DEMO_REPORTS[0]
    expect(second).toBeDefined()
    expect(first).toBeDefined()
    if (second === undefined || first === undefined) return

    draw()
    const subrail = await screen.findByTestId('report-subrail')
    await userEvent.click(within(subrail).getByText(second.label))

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

describe('what the rail marks current', () => {
  /**
   * A stale id and a deliberate return to the index put the same screen in the
   * pane, so the rail owes the same answer for both.
   */
  it('marks the Report row current when the open id names no report', async () => {
    draw({ openId: 'a-report-this-case-does-not-have' })

    const row = await screen.findByTestId('rail-report-index')
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(row).toHaveAttribute('aria-current', 'page')
  })

  /**
   * The converse, so the fix is not "mark it always": a document open is the
   * one state where the parent row is not the current one.
   */
  it('leaves the Report row unmarked while one of its reports is open', async () => {
    const first = DEMO_REPORTS[0]
    expect(first).toBeDefined()
    if (first === undefined) return

    draw({ openId: first.id })

    const row = await screen.findByTestId('rail-report-index')
    expect(row).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId(`rail-report-${first.id}`)).toHaveAttribute('aria-current', 'page')
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

    expect(container.querySelectorAll('[data-slot="pane-scroll"]')).toHaveLength(1)
    expect(screen.getAllByTestId('rail')).toHaveLength(1)
  })

  /**
   * The reports are navigation, so they belong to the rail.
   */
  it('puts its report rows in the case rail rather than in the pane', async () => {
    const { container } = draw()

    const subrail = await screen.findByTestId('report-subrail')
    const rail = screen.getByTestId('rail')
    const pane = container.querySelector('[data-slot="pane-scroll"]')
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
    // `Case notes` stands for the Case group: `Case settings` used to and the
    // section is gone, its fields being two tabs of the case overview now.
    for (const label of ['Case overview', 'Timeline', 'Evidence', 'Compliance', 'Case notes']) {
      expect(within(rail).getByText(label)).toBeInTheDocument()
    }
  })
})
