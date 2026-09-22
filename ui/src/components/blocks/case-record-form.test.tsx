import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { CaseRecordForm } from './case-record-form'

/** A field of the record, by the label the served form gives it. */
function field(name: string): HTMLElement {
  return screen.getByRole('textbox', { name })
}

describe('a case served again while the analyst is typing', () => {
  it('keeps the typed field and adopts the one nobody touched', async () => {
    const user = userEvent.setup()
    const view = render(<CaseRecordForm kase={campaignCase} specs={specsFixture} pane="details" />)
    const typed = 'Northwind Freight'

    await user.clear(field('Customer'))
    await user.type(field('Customer'), typed)

    // The refetch: a new document whose Summary another analyst has changed.
    const served = { ...campaignCase, summary: 'Rewritten by somebody else.' }
    view.rerender(<CaseRecordForm kase={served} specs={specsFixture} pane="details" />)

    expect(field('Customer')).toHaveValue(typed)
    expect(field('Summary')).toHaveValue(served.summary)
  })

  it('keeps a value the server refused, after the rollback', async () => {
    const user = userEvent.setup()
    const writes = { save: vi.fn().mockRejectedValue(new Error('409')) }
    const view = render(
      <CaseRecordForm kase={campaignCase} specs={specsFixture} pane="details" writes={writes} />,
    )
    const typed = 'Northwind Freight'

    await user.clear(field('Customer'))
    await user.type(field('Customer'), typed)
    await user.tab()
    expect(writes.save).toHaveBeenCalledWith('customer', typed, campaignCase.version)

    // The rollback: the case as it was before the write, a new document.
    view.rerender(
      <CaseRecordForm
        kase={{ ...campaignCase }}
        specs={specsFixture}
        pane="details"
        writes={writes}
      />,
    )

    expect(field('Customer')).toHaveValue(typed)
  })
})
