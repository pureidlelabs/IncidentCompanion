/**
 * **A refused report keeps what the analyst chose.**
 *
 * The dialog used to call `onCreate` and close in the same breath, so a write
 * the server refused took the layout, the name, the stage and the marking with
 * it. `announcing` still raises the toast; what was lost is everything typed.
 * -> #194, and the contract `EntityDialog` took in #183.
 *
 * What this does not cover: the two writes a report actually costs. `onCreate`
 * reports the choice, and seeding the sections is the container's second write
 * -- a refusal there is not this dialog's to hold.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DEMO_LAYOUTS, DEMO_TLP } from '@/components/blocks/report-layouts'

import { ReportNewDialog } from './report-new-dialog'

function draw(onCreate: (choice: unknown) => unknown) {
  const onOpenChange = vi.fn()
  render(
    <ReportNewDialog
      open
      onOpenChange={onOpenChange}
      layouts={DEMO_LAYOUTS}
      markings={DEMO_TLP}
      onCreate={onCreate as never}
    />,
  )
  return { onOpenChange }
}

/** The footer's own control, which is the one an analyst presses. */
function createButton() {
  return screen.getByRole('button', { name: /^Create/ })
}

describe('a report the server would not take', () => {
  it('keeps the dialog open when the write is refused', async () => {
    const user = userEvent.setup()
    const refuse = vi.fn(() => Promise.reject(new Error('refused')))
    const { onOpenChange } = draw(refuse)

    await user.click(createButton())

    await waitFor(() => {
      expect(refuse).toHaveBeenCalledTimes(1)
    })
    expect(
      onOpenChange,
      'the dialog closed on a refusal, discarding the choices',
    ).not.toHaveBeenCalledWith(false)
  })

  it('keeps the name that was typed', async () => {
    const user = userEvent.setup()
    draw(() => Promise.reject(new Error('refused')))

    const name = screen.getByLabelText(/name/i)
    await user.type(name, 'Board briefing')
    await user.click(createButton())

    await waitFor(() => {
      expect(name).toHaveValue('Board briefing')
    })
  })

  /** The other direction: a write that lands still closes the dialog. */
  it('closes when the write lands', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = draw(() => Promise.resolve())

    await user.click(createButton())

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  /**
   * A caller answering nothing has already done whatever it does, so the dialog
   * behaves as it always did rather than waiting for something that will never
   * resolve.
   */
  it('closes at once for a caller that answers nothing', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = draw(() => undefined)

    await user.click(createButton())

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not send a second create while the first is out', async () => {
    const user = userEvent.setup()
    const never = vi.fn(() => new Promise<void>(() => undefined))
    draw(never)

    await user.click(createButton())
    await user.click(createButton())
    await user.click(createButton())

    expect(never, 'a press while the create was in flight sent another').toHaveBeenCalledTimes(1)
  })
})
