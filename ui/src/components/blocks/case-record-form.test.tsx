import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { Case } from '@/api/model'
import { useRowDraft } from '@/api/rowDraft'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { CaseRecordForm, type CaseWrites } from './case-record-form'

/** The form with the draft a screen holds above it. */
function Held({ kase, writes }: { kase: Case; writes?: CaseWrites }) {
  const draft = useRowDraft(kase, writes?.save, true)
  return <CaseRecordForm draft={draft} caseId={kase.id} specs={specsFixture} pane="details" />
}

/** A field of the record, by the label the served form gives it. */
function field(name: string): HTMLElement {
  return screen.getByRole('textbox', { name })
}

describe('a case served again while the analyst is typing', () => {
  it('keeps the typed field and adopts the one nobody touched', async () => {
    const user = userEvent.setup()
    const view = render(<Held kase={campaignCase} />)
    const typed = 'Northwind Freight'

    await user.clear(field('Customer'))
    await user.type(field('Customer'), typed)

    // The refetch: a newer document whose Summary another analyst has changed.
    const served = {
      ...campaignCase,
      version: campaignCase.version + 1,
      summary: 'Rewritten by somebody else.',
    }
    view.rerender(<Held kase={served} />)

    expect(field('Customer')).toHaveValue(typed)
    expect(field('Summary')).toHaveValue(served.summary)
  })

  it('keeps a value the server refused, and says it is not saved yet', async () => {
    const user = userEvent.setup()
    const writes = {
      save: vi.fn().mockRejectedValue(new ApiError(409, 'Someone else wrote this first.', {})),
    }
    const view = render(<Held kase={campaignCase} writes={writes} />)
    const typed = 'Northwind Freight'

    await user.clear(field('Customer'))
    await user.type(field('Customer'), typed)
    await user.tab()
    expect(writes.save).toHaveBeenCalledWith({ customer: typed }, campaignCase.version)

    // The case read again at the same version: nothing has decided the refusal yet.
    view.rerender(<Held kase={{ ...campaignCase }} writes={writes} />)

    expect(field('Customer')).toHaveValue(typed)
    expect(await screen.findByText(/Not saved yet/)).toBeVisible()
  })
})
