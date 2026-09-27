/**
 * What a case screen does when another analyst changes a field this analyst
 * is changing.
 *
 * Two screens hold the case's own fields and the compliance record field by
 * field, so an analyst can be part-way through a change when another analyst's
 * write repaints the screen. The answer is a band naming the field and the
 * other value, and these are attacks on it disappearing.
 *
 * The report index is the third surface here and is not a merge review:
 * copying a report writes a new row rather than racing an existing one, so
 * there is no field to name and no value of somebody else's to go and read.
 * What it owes is the server's own reason, which it was throwing away.
 *
 * **The repaint is the attack, not the render.** The other analyst's write
 * repaints every open screen, which is the same moment each screen reconciles
 * what it holds against the record it was handed.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { ComplianceScreen } from './compliance'
import { OverviewScreen } from './overview'
import { ReportIndexPane } from '@/components/blocks/report-index'
import { CAMPAIGN_NOW, campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { regimesFixture } from '@/fixtures/regimes'
import { specsFixture } from '@/fixtures/specs'
import { DEMO_BLOCKS, DEMO_REPORTS } from '@/fixtures/report-demo'
import { DEMO_HEADINGS } from '@/components/blocks/report-layouts'

/**
 * **Presence rather than paint, and only here.** The overview draws its form on
 * a tab, the kit's `TabPanel` animates its box in with Motion, and jsdom runs
 * no animation - so the live panel's inline style stays `opacity: 0` and
 * `toBeVisible` answers `false` however well the band renders in a browser.
 * -> `overview-tabs.test.tsx`
 */
describe('the overview form', () => {
  it('says nothing when nobody else changed a field', () => {
    render(<OverviewScreen now={CAMPAIGN_NOW} kase={campaignCase} specs={specsFixture} record={campaignCompliance} />)
    expect(screen.queryByRole('group', { name: /changed/ })).toBeNull()
  })

  it('names the field and the other value, and keeps what was typed through the repaint', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <OverviewScreen now={CAMPAIGN_NOW} kase={campaignCase} specs={specsFixture} record={campaignCompliance} />,
    )
    await user.click(screen.getByRole('tab', { name: 'Properties' }))
    const customer = screen.getByRole('textbox', { name: 'Customer' })
    await user.clear(customer)
    await user.type(customer, 'Mine')

    rerender(
      <OverviewScreen
        now={CAMPAIGN_NOW}
        kase={{ ...campaignCase, version: campaignCase.version + 1, customer: 'Theirs' }}
        specs={specsFixture}
        record={campaignCompliance}
      />,
    )

    expect(screen.getByRole('group', { name: 'Another analyst changed Customer' })).toHaveTextContent('Theirs')
    expect(screen.getByRole('textbox', { name: 'Customer' })).toHaveValue('Mine')
  })
})

describe('the compliance form', () => {
  it('says nothing when nobody else changed an answer', () => {
    render(<ComplianceScreen record={campaignCompliance} specs={specsFixture} regimes={regimesFixture} />)
    expect(screen.queryByRole('group', { name: /changed/ })).toBeNull()
  })

  /** A card folds shut once every question in it is answered, so a band drawn inside one is a band nobody sees. */
  it('names the answer and the other value above the cards', async () => {
    const user = userEvent.setup()
    const record = { ...campaignCompliance, financialImpact: '' }
    const { rerender } = render(<ComplianceScreen record={record} specs={specsFixture} regimes={regimesFixture} />)
    const fold = document.querySelector<HTMLElement>('[data-fold="Incident facts"]')
    if (fold?.getAttribute('aria-expanded') === 'false') await user.click(fold)
    await user.type(screen.getByRole('textbox', { name: 'Financial impact' }), 'Mine')

    rerender(
      <ComplianceScreen
        record={{ ...record, version: record.version + 1, financialImpact: 'Theirs' }}
        specs={specsFixture}
        regimes={regimesFixture}
      />,
    )

    const band = screen.getByRole('group', { name: 'Another analyst changed Financial impact' })
    expect(band).toHaveTextContent('Theirs')
    const firstCard = document.querySelector('[data-fold]')
    if (firstCard) expect(band.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('the report index', () => {
  const refuse = () =>
    Promise.reject(new ApiError(409, 'This case is frozen; nothing new can be written to it.', {}))

  it('says nothing when a copy goes through', async () => {
    const user = userEvent.setup()
    render(<ReportIndexPane headings={DEMO_HEADINGS} reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={() => Promise.resolve()} />)
    await duplicateTheFirstReport(user)
    expect(screen.queryByText(/was not copied/)).toBeNull()
  })

  it('does not swallow the reason a copy was refused', async () => {
    const user = userEvent.setup()
    render(<ReportIndexPane headings={DEMO_HEADINGS} reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={refuse} />)
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
    render(<ReportIndexPane headings={DEMO_HEADINGS} reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={refuse} />)
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
    render(<ReportIndexPane headings={DEMO_HEADINGS} reports={DEMO_REPORTS} blocks={DEMO_BLOCKS} onDuplicate={refuse} />)
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
 *
 * The row menu is opened by name rather than by position, so a column order
 * change fails this loudly instead of pressing whatever moved into the slot.
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
