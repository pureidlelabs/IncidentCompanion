/**
 * Opening something over the screen moves focus into it and returns it after.
 *
 * *GIVEN something that opens over the screen, WHEN it opens, THEN focus moves
 * into it, stays within it, and returns when it closes.*
 *
 * An analyst working from the keyboard who opens a dialog and keeps typing into
 * the screen behind it is the failure this names, and it is invisible to
 * anybody using a mouse -- which is everybody who reviews the change.
 *
 * **Focus is what jsdom can see; a rendered box is not.** `CLAUDE.md` records
 * that every element here has a zero box, so a layer test that asked whether
 * the dialog covered the screen would pass on nothing being drawn. Where focus
 * is, and what it returns to, are real in jsdom because they are document
 * state rather than layout.
 *
 * **What a break-verification could reach here is limited, and saying so is the
 * point.** Removing the `AriaDialog` wrapper reddens both cases, but it takes
 * the `dialog` role with it, so it shows these depend on the dialog machinery
 * rather than that they detect a focus failure specifically. The assertions
 * carry that themselves: focus that never moves leaves `document.activeElement`
 * on `body`, which both cases name.
 *
 * **The trap itself is not asserted here, and the docstring says so rather than
 * implying it.** *Stays within it* is `FocusScope` keeping Tab inside, which
 * depends on the browser's own sequential navigation -- jsdom does not
 * implement it, so a passing assertion would be about userEvent's approximation
 * of tabbing rather than about the dialog. What is held is the half that is
 * real here: focus goes in, and comes back.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTrigger } from './dialog'

function Example() {
  return (
    <DialogTrigger>
      <Button>Open it</Button>
      <Dialog>
        <DialogHeader title="A dialog" />
        <DialogBody>
          <Button>Inside</Button>
        </DialogBody>
        <DialogFooter>
          <Button slot="close">Close</Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  )
}

describe('something that opens over the screen', () => {
  it('moves focus into itself when it opens', async () => {
    const analyst = userEvent.setup()
    render(<Example />)

    await analyst.click(screen.getByRole('button', { name: 'Open it' }))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      // Named separately from the containment below: focus never moving leaves
      // it on `body`, which is the shape this fails in.
      expect(
        document.activeElement,
        'focus was never moved at all, so it is still wherever the screen behind left it',
      ).not.toBe(document.body)
      expect(
        dialog.contains(document.activeElement),
        'focus stayed on the screen behind, so an analyst typing from the keyboard is ' +
          'still editing what the dialog is covering',
      ).toBe(true)
    })
  })

  it('gives focus back to what opened it when it closes', async () => {
    const analyst = userEvent.setup()
    render(<Example />)

    const opener = screen.getByRole('button', { name: 'Open it' })
    await analyst.click(opener)
    await screen.findByRole('dialog')

    await analyst.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await waitFor(() => {
      expect(
        document.activeElement,
        'focus was left on nothing after the dialog closed, so the keyboard starts again ' +
          'from the top of the document',
      ).toBe(opener)
    })
  })
})
