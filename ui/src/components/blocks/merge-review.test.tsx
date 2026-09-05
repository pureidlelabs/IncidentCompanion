/**
 * What the merge review says when a versioned write was refused.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MergeReview } from './merge-review'

describe('a refused write', () => {
  it('names the field, and not some other field of the same row', () => {
    render(<MergeReview field="Verdict" by="A. Okonkwo" />)
    expect(screen.getByText('Verdict was not saved')).toBeVisible()
  })

  it('names who wrote first, because the answer is a person rather than a fault', () => {
    render(<MergeReview field="Verdict" by="A. Okonkwo" />)
    expect(screen.getByText(/A\. Okonkwo set it first/)).toBeVisible()
  })

  it('is announced rather than waiting to be scanned', () => {
    render(<MergeReview field="Verdict" by="A. Okonkwo" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Verdict was not saved')
  })

  it('sends the analyst to the field when the write named no row', () => {
    render(<MergeReview field="Severity" by="R. Okonkwo" />)
    expect(screen.getByText(/Reopen the field to see what it holds now\./)).toBeVisible()
    // The row half of the sentence has to be absent rather than empty: "set it
    // on  first" reads as a row whose name failed to load.
    expect(screen.queryByText(/set it on/)).toBeNull()
  })

  it('names the row when the write was to one, and sends them to it', () => {
    render(<MergeReview field="Verdict" by="A. Okonkwo" row="FIN-WS-014" />)
    expect(screen.getByText(/A\. Okonkwo set it on FIN-WS-014 first\./)).toBeVisible()
    expect(screen.getByText(/Reopen the row to see what it holds now\./)).toBeVisible()
  })

  it('does not send them to the field when the loss was to one row of many', () => {
    render(<MergeReview field="Verdict" by="A. Okonkwo" row="FIN-WS-014" />)
    expect(screen.queryByText(/Reopen the field/)).toBeNull()
  })
})
