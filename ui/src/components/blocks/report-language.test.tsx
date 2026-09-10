import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DEMO_BLOCKS, blocksOf, demoReport } from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'

import { ReportWorkspace } from './report-workspace'

/**
 * A report says which language it is in, and an analyst can change it.
 *
 * **The language was settable through the API alone.** A report carries one,
 * every heading the application supplies is resolved through it, and no screen
 * showed it -- so an analyst could not tell a Dutch report from an English one
 * without reading the headings. -> #384
 *
 * Written from the attack a control like this invites: one that draws the
 * value and is wired to nothing. Every case below reads the *handler*, not the
 * rendering, because a select that shows `Nederlands` and sends nothing looks
 * finished.
 */

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
]

function open(report = demoReport(0), onLanguage?: (code: string) => void) {
  return render(
    <ReportWorkspace
      report={report}
      blocks={blocksOf(DEMO_BLOCKS, report.id)}
      kase={campaignCase}
      languages={LANGUAGES}
      {...(onLanguage ? { onLanguage } : {})}
    />,
  )
}

describe('the language a report is in', () => {
  it('is on the screen, named', () => {
    open({ ...demoReport(0), language: 'nl' })
    expect(screen.getByRole('button', { name: /language/i })).toHaveTextContent('Nederlands')
  })

  it('sends the code the analyst picked, not the label', async () => {
    const user = userEvent.setup()
    const chose = vi.fn()
    open({ ...demoReport(0), language: 'en' }, chose)

    await user.click(screen.getByRole('button', { name: /language/i }))
    await user.click(await screen.findByRole('option', { name: 'Nederlands' }))

    expect(chose, 'the control drew the language and changed nothing').toHaveBeenCalledWith('nl')
  })

  it('offers no change on a report nobody may edit', () => {
    // A sent report is frozen: its headings are the ones it was filed with,
    // and re-resolving them would rewrite a document already delivered.
    //
    // **The handler is supplied on purpose.** Without one the control is
    // disabled for want of anywhere to send the change, and the assertion
    // would hold whatever the screen does about a frozen report.
    open({ ...demoReport(0), language: 'en', sentAt: '2026-03-04T09:15:00.000Z' }, vi.fn())
    expect(screen.getByRole('button', { name: /language/i })).toBeDisabled()
  })

  it('draws nothing when the install offers no list', () => {
    // The gallery, and any caller that has not asked for the layouts yet.
    render(
      <ReportWorkspace
        report={demoReport(0)}
        blocks={blocksOf(DEMO_BLOCKS, demoReport(0).id)}
        kase={campaignCase}
      />,
    )
    expect(screen.queryByRole('button', { name: /language/i })).toBeNull()
  })
})
