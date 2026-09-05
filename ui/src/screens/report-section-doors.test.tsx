import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_LAYOUTS, DEMO_TLP } from '@/components/blocks/report-layouts'

import { CaseFrame } from '@/components/blocks/case-frame'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import {
  DEMO_BLOCKS,
  DEMO_REPORTS,
  blocksOf,
  demoReport,
  headingOf,
} from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'

import { ReportSectionScreen } from './report-section'

/**
 * The two doors on the open document: adding a section, and rearranging them.
 */
const SECOND = demoReport(1)
const SECOND_BLOCKS = blocksOf(DEMO_BLOCKS, SECOND.id)

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

/** Open a report from the rail, so the id under test is not the default one. */
async function open(label: string) {
  const user = userEvent.setup()
  const subrail = await screen.findByTestId('report-subrail')
  await user.click(within(subrail).getByText(label))
}

describe('adding a section', () => {
  /**
   * **The control is drawn on the seam's presence, not on nothing.**
   * `onAddSection` wired to a function that returns leaves an analyst opening a
   * menu of twenty-two kinds where pressing one does nothing - the one defect a
   * render assertion cannot see, because the screen looks identical either
   * way.
   */
  it('draws the Add control only when something is listening', async () => {
    const { unmount } = draw()
    await open(SECOND.label)
    expect(screen.queryByRole('button', { name: 'Add section' })).toBeNull()
    unmount()

    draw({ onAddSection: vi.fn() })
    await open(SECOND.label)
    expect(screen.getByRole('button', { name: 'Add section' })).toBeInTheDocument()
  })
})

describe('rearranging the sections', () => {
  it('sends every section of the open report, in the new order', async () => {
    const user = userEvent.setup()
    const onReorder = vi.fn()
    draw({ onReorder })

    await open(SECOND.label)
    const moved = SECOND_BLOCKS[0]
    expect(moved).toBeDefined()
    if (moved === undefined) return

    screen.getByRole('button', { name: `Drag ${headingOf(moved)}` }).focus()
    await user.keyboard('{Enter}')
    // The gaps are registered a turn after the pickup, and an arrow key
    // arriving first is swallowed - the drop then lands where the section
    // already was and reports nothing, which reads as a broken seam.
    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(/^Insert /)
    })
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    const before = SECOND_BLOCKS.map((block) => block.id)
    // **Awaited, because the drop settles a turn after the key.** React Aria
    // resolves the dragged items' data before it reports the reorder, so an
    // assertion made straight after Enter reads zero calls - and the same test
    // passes whenever anything else yields first, which is what makes it a
    // flake rather than a failure.
    await waitFor(() => {
      expect(onReorder).toHaveBeenCalledWith([before[1], before[0], ...before.slice(2)])
    })
  })

  /** No listener, no grip: a grip that answers a press with nothing reads worse. */
  it('offers no grip when nothing is listening', async () => {
    draw()
    await open(SECOND.label)
    expect(screen.queryAllByRole('button', { name: /^Drag / })).toHaveLength(0)
  })

  /** The demo's other reports are on the rail, and their sections stay out of it. */
  it('finds more than one report to tell apart', () => {
    expect(DEMO_REPORTS.length).toBeGreaterThan(1)
    expect(SECOND_BLOCKS.length).toBeGreaterThan(1)
  })
})
