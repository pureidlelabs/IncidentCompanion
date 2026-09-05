import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'

import { reportWriteFailure, toast, toastQueue } from './notify'
import { ToastRegion } from '@/components/ui/toast'

/**
 * The one test that renders the real region against the real primitive.
 */
describe('the toast region', () => {
  // **The queue is a module singleton and outlives testing-library's cleanup**,
  // so a toast raised by one case is still queued in the next and every query
  // in this file matches twice.
  afterEach(() => {
    toastQueue.clear()
  })

  it('renders a raised toast, with its description', async () => {
    render(<ToastRegion queue={toastQueue} />)
    toast.error('Systems was not saved.', { description: 'severity: not a known value' })
    expect(await screen.findByText('Systems was not saved.')).toBeInTheDocument()
    expect(screen.getByText('severity: not a known value')).toBeInTheDocument()
  })

  /**
   * **A toast an analyst cannot hear did not happen.**
   */
  it('announces what it raised', async () => {
    render(<ToastRegion queue={toastQueue} />)
    toast.error('Indicators was not saved.')
    const raised = await screen.findByText('Indicators was not saved.')

    const announced = raised.closest('[role="alert"]')
    expect(announced, 'the toast rendered outside the live region').not.toBeNull()
    // `aria-atomic`, because a live region without it announces the changed
    // node alone - which is the description on its own when a toast carries
    // both, and a sentence with no subject.
    expect(announced).toHaveAttribute('aria-atomic', 'true')
    expect(announced).not.toHaveAttribute('aria-hidden')
  })

  /*
   * `toBeVisible` is unavailable anywhere inside this card, and the cause is
   * the harness: the entry animation's `initial` sets `opacity: 0` inline, jsdom
   * runs no frames, so every element under the toast measures as invisible
   * for the whole test. The assertions above are structural for that reason.
   */

  /**
   * **An error toast has no timeout on purpose, so it owes a way out that is not
   * a pointer.**
   */
  it('offers a keyboard exit from a persistent error', async () => {
    render(<ToastRegion queue={toastQueue} />)
    toast.error('Indicators was not saved.')
    const raised = await screen.findByText('Indicators was not saved.')

    const card = raised.closest('[data-slot="toast"]')
    expect(card, 'the toast rendered outside the kit\'s card').not.toBeNull()
    const close = within(card as HTMLElement).getByRole('button', { name: /dismiss/i })
    close.focus()
    expect(close).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(screen.queryByText('Indicators was not saved.')).not.toBeInTheDocument(),
    )
  })

  /**
   * The refusal card draws its own chrome and its own controls, so it is the one
   * shape whose dismissal is not React Aria's close button.
   */
  it('draws the refusal card, and its own Dismiss closes it', async () => {
    render(<ToastRegion queue={toastQueue} />)
    reportWriteFailure(
      new ApiError(422, 'Validation failed', {
        errors: [{ path: ['hostname'], message: 'Already on this case.' }],
      }),
      'Systems',
    )

    expect(await screen.findByText('Systems was not saved.')).toBeInTheDocument()
    expect(screen.getByText('Already on this case.')).toBeInTheDocument()

    // **The card draws its own heading, so React Aria has no `slot="title"` to
    // name the toast from.** Without the fallback the refusal announces as an
    // unnamed dialog, and nothing on screen looks wrong.
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Systems was not saved.')

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(screen.queryByText('Systems was not saved.')).not.toBeInTheDocument(),
    )
  })

  /**
   * **Retry runs the write and takes the card with it.**
   */
  it('runs the retry it was given, once, and closes', async () => {
    const retry = vi.fn()
    render(<ToastRegion queue={toastQueue} />)
    reportWriteFailure(new TypeError('Failed to fetch'), 'Systems', { retry })

    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(retry).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByText('Systems was not saved.')).not.toBeInTheDocument(),
    )
  })
})

/*
 * There was a case here - "shows nothing before anything is raised" - and it
 * was deleted rather than kept. Break-verified against a region rendering
 * nothing at all, it stayed green: an empty viewport and a broken one have the
 * same DOM, so it asserted the component's failure mode as its success. The
 * rendering claim above is the one with an instrument behind it.
 */
