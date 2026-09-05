import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'

import { WriteFailure } from './write-failure'

/**
 * The card a refused write is drawn on.
 *
 * **Not a `toast.error` with a description any more**, which said "Validation
 * failed" and named none of the fields the server had already listed. What is
 * asserted here is that each of the three tiers reaches the screen - the
 * sentence, the fields, and the way out - and that the two the analyst can act
 * on are controls rather than text.
 */
const REFUSED = new ApiError(422, 'Validation failed', {
  message: 'Validation failed',
  errors: [
    { code: 'too_small', path: ['value'], message: 'Too small: expected >=1 characters' },
    { code: 'invalid_value', path: ['triage'], message: 'Invalid option' },
  ],
})

describe('WriteFailure', () => {
  it('names what was not saved, and why', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)

    expect(screen.getByText('Indicators was not saved.')).toBeInTheDocument()
    expect(screen.getByText('Validation failed')).toBeInTheDocument()
  })

  it('lists every field the server refused, with its own sentence', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)

    const details = screen.getByRole('list', { name: 'Fields refused' })
    const rows = within(details).getAllByRole('listitem')

    expect(rows.map((row) => row.textContent)).toEqual([
      'valueToo small: expected >=1 characters',
      'triageInvalid option',
    ])
  })

  /**
   * **The field name is mono and the sentence is not.** `--text-data` names a
   * face for "text an analyst would copy, compare or grep" - a schema field
   * name is that, and "Too small: expected >=1 characters" is prose, which a
   * code face makes slower to read rather than more precise.
   */
  it('sets the field name in the data face and the sentence in sans', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)

    const first = within(screen.getByRole('list', { name: 'Fields refused' })).getAllByRole(
      'listitem',
    )[0]!

    expect(within(first).getByText('value').className).toContain('font-mono')
    expect(within(first).getByText('Too small: expected >=1 characters').className).not.toContain(
      'font-mono',
    )
  })

  /**
   * A refusal carrying no field list - a 500, a network failure, a 409 - draws
   * the sentence and the way out and nothing between them. An empty list with
   * a heading over it reads as fields that failed to load.
   */
  it('draws no field list when the refusal named none', () => {
    render(
      <WriteFailure
        what="Indicators"
        error={new ApiError(500, 'IncidentCompanion did not answer.', null)}
        onDismiss={() => undefined}
      />,
    )

    expect(screen.queryByRole('list', { name: 'Fields refused' })).not.toBeInTheDocument()
    expect(screen.getByText('IncidentCompanion did not answer.')).toBeInTheDocument()
  })

  /**
   * **Retrying a refused write repeats it exactly.** The body is unchanged and
   * the server's answer is a function of the body, so a 422 answers 422 again
   * - the analyst presses a button that cannot work and learns nothing. What
   * is worth retrying is a refusal that named nothing: a dropped connection, a
   * 500, a proxy in the way.
   */
  it('offers no Retry for a refusal that named fields, even when one is passed', () => {
    render(
      <WriteFailure
        what="Indicators"
        error={REFUSED}
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('offers Retry only where the caller can retry, and Dismiss always', async () => {
    const retry = vi.fn()
    const dismiss = vi.fn()
    const unanswered = new ApiError(0, 'IncidentCompanion did not answer.', null)
    const { rerender } = render(
      <WriteFailure what="Indicators" error={unanswered} onRetry={retry} onDismiss={dismiss} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismiss).toHaveBeenCalledOnce()

    rerender(<WriteFailure what="Indicators" error={unanswered} onDismiss={dismiss} />)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  /**
   * **Both controls answer the keyboard, which is the half a click cannot
   * see.**
   *
   * The kit's `Button` is React Aria and takes `onPress`. `onClick` is still
   * accepted on it and still fires for a pointer, so a handler wired to the
   * wrong prop passes every assertion above - and then does nothing for an
   * analyst who tabs to Dismiss and presses Enter. The card is drawn over a
   * refused write during an incident, where the hands are on the keyboard.
   */
  it('runs both handlers from the keyboard, not only from a pointer', async () => {
    const retry = vi.fn()
    const dismiss = vi.fn()
    render(
      <WriteFailure
        what="Indicators"
        error={new ApiError(0, 'IncidentCompanion did not answer.', null)}
        onRetry={retry}
        onDismiss={dismiss}
      />,
    )

    screen.getByRole('button', { name: 'Retry' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(retry).toHaveBeenCalledOnce()

    screen.getByRole('button', { name: 'Dismiss' }).focus()
    await userEvent.keyboard(' ')
    expect(dismiss).toHaveBeenCalledOnce()
  })

  /**
   * **The cap is stated, not silent.** A write can be refused on more fields
   * than a 356px toast can hold, and a card that quietly drew the first four
   * would read as a complete list - so the row that is not there is counted.
   */
  it('counts the fields it did not draw rather than dropping them quietly', () => {
    const many = new ApiError(422, 'Validation failed', {
      errors: Array.from({ length: 7 }, (_, n) => ({
        path: [`field${String(n)}`],
        message: 'Invalid option',
      })),
    })
    render(<WriteFailure what="Indicators" error={many} onDismiss={() => undefined} />)

    const rows = within(screen.getByRole('list', { name: 'Fields refused' })).getAllByRole(
      'listitem',
    )
    expect(rows).toHaveLength(4)
    expect(screen.getByText('and 3 more')).toBeInTheDocument()
  })

  it('says nothing about a count when every field fits', () => {
    render(<WriteFailure what="Indicators" error={REFUSED} onDismiss={() => undefined} />)
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })
})
