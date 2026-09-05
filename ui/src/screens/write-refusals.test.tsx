/**
 * What a case screen does when a versioned write comes back refused.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { ComplianceScreen } from './compliance'
import { OverviewScreen } from './overview'
import { ReportIndexPane } from '@/components/blocks/report-index'
import { TimelineScreen } from './timeline'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { regimesFixture } from '@/fixtures/regimes'
import { specsFixture } from '@/fixtures/specs'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/components/blocks/report-shape'

/**
 * **Presence rather than paint, and only here.**
 */
describe('the overview form', () => {
  it('says nothing when nothing was refused', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    expect(screen.queryByText(/was not saved/)).toBeNull()
  })

  it('names the field another analyst set first', () => {
    render(<OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} refusal={{ field: 'Severity', by: 'A. Okonkwo' }} />)
    expect(screen.getByText('Severity was not saved')).toBeInTheDocument()
    expect(screen.getByText(/A\. Okonkwo set it first/)).toBeInTheDocument()
  })

  it('keeps the refusal through the repaint that caused it', () => {
    const { rerender } = render(
      <OverviewScreen kase={campaignCase} specs={specsFixture} record={campaignCompliance} refusal={{ field: 'Severity', by: 'A. Okonkwo' }} />,
    )
    // A fresh object with the other analyst's value in it: the identity change
    // is what drives the form's draft reset.
    rerender(
      <OverviewScreen
        kase={{ ...campaignCase, severity: 'critical' }}
        specs={specsFixture}
        record={campaignCompliance}
        refusal={{ field: 'Severity', by: 'A. Okonkwo' }}
      />,
    )
    expect(screen.getByText('Severity was not saved')).toBeInTheDocument()
  })
})

describe('the compliance form', () => {
  it('says nothing when nothing was refused', () => {
    render(<ComplianceScreen record={campaignCompliance} specs={specsFixture} regimes={regimesFixture} />)
    expect(screen.queryByText(/was not saved/)).toBeNull()
  })

  it('names the field another analyst set first', () => {
    render(<ComplianceScreen record={campaignCompliance} specs={specsFixture} regimes={regimesFixture} refusal={{ field: 'Notified at', by: 'R. Okonkwo' }} />)
    expect(screen.getByText('Notified at was not saved')).toBeVisible()
  })

  /** The regimes decide which cards exist; a refusal is not one of them. */
  it('draws the refusal above the cards rather than inside one', () => {
    render(<ComplianceScreen record={campaignCompliance} specs={specsFixture} regimes={regimesFixture} refusal={{ field: 'Notified at', by: 'R. Okonkwo' }} />)
    const band = screen.getByRole('alert')
    const verdicts = document.querySelector('[data-slot="compliance-verdicts"]')
    if (verdicts) expect(band.compareDocumentPosition(verdicts)).toBeGreaterThan(0)
    expect(screen.getByText('Notified at was not saved')).toBeVisible()
  })
})

describe('the timeline table', () => {
  it('says nothing when nothing was refused', () => {
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    expect(screen.queryByText(/was not saved/)).toBeNull()
  })

  it('names the row as well as the field, there being one field per row', () => {
    render(
      <TimelineScreen kase={campaignCase} specs={specsFixture} refusal={{ field: 'Phase', row: 'Initial access', by: 'A. Okonkwo' }} />,
    )
    expect(screen.getByText('Phase was not saved')).toBeVisible()
    expect(screen.getByText(/set it on Initial access first/)).toBeVisible()
  })

  /**
   * The refusal is not part of the table body.
   */
  it('survives a filter that hides every row', () => {
    render(
      <TimelineScreen
        kase={campaignCase}
        specs={specsFixture}
        search="no-entry-matches-this-string-anywhere"
        refusal={{ field: 'Phase', row: 'Initial access', by: 'A. Okonkwo' }}
      />,
    )
    expect(screen.getByText(/No entry matches all of these filters at once/)).toBeVisible()
    expect(screen.getByText('Phase was not saved')).toBeVisible()
  })
})

describe('the report index', () => {
  const refuse = () =>
    Promise.reject(new ApiError(409, 'This case is frozen; nothing new can be written to it.', {}))

  it('says nothing when a copy goes through', async () => {
    const user = userEvent.setup()
    render(<ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={() => Promise.resolve()} />)
    await duplicateTheFirstReport(user)
    expect(screen.queryByText(/was not copied/)).toBeNull()
  })

  it('does not swallow the reason a copy was refused', async () => {
    const user = userEvent.setup()
    render(<ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={refuse} />)
    await duplicateTheFirstReport(user)
    expect(
      await screen.findByText('This case is frozen; nothing new can be written to it.'),
    ).toBeVisible()
  })

  /**
   * Several rows can be mid-copy at once -- the busy set is plural by
   * construction -- so a band reading "that report" would be ambiguous on the
   * screen's own terms.
   */
  it('names which report was not copied', async () => {
    const user = userEvent.setup()
    render(<ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={refuse} />)
    const title = await duplicateTheFirstReport(user)
    expect(await screen.findByText(`${title} was not copied`)).toBeVisible()
  })

  /**
   * A row left in the busy set can never be copied again: its own menu row
   * stays disabled and reads `Duplicating`, which is a screen that has quietly
   * stopped working for that report and says nothing about it.
   *
   * Asserted by reopening the menu rather than by the title cell's opacity: a
   * dimmed row is a hint, and the disabled control is the thing that actually
   * takes the retry away.
   */
  it('lets the refused row be tried again', async () => {
    const user = userEvent.setup()
    render(<ReportIndexPane reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={refuse} />)
    await duplicateTheFirstReport(user)
    await screen.findByText(/was not copied/)

    const menus = screen.getAllByRole('button', { name: /actions|more/i })
    const menu = menus[0]
    if (!menu) throw new Error('no row actions control on the report index')
    await user.click(menu)
    const again = await screen.findByRole('menuitem', { name: 'Duplicate' })
    expect(again).not.toHaveAttribute('aria-disabled', 'true')
  })
})

/**
 * Presses Duplicate on the first report and answers with its title.
 */
async function duplicateTheFirstReport(
  user: ReturnType<typeof userEvent.setup>,
): Promise<string> {
  const first = DEMO_REPORTS[0]
  if (!first) throw new Error('the report fixture is empty')
  // The same fallback the title cell draws, so the band and the row it points
  // at cannot end up calling the report two different things.
  const named = first.label || 'Untitled report'
  const menus = screen.getAllByRole('button', { name: /actions|more/i })
  const menu = menus[0]
  if (!menu) throw new Error('no row actions control on the report index')
  await user.click(menu)
  await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
  return named
}
