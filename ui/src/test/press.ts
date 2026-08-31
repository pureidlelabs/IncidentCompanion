import { fireEvent } from '@testing-library/react'

/**
 * Open a Base UI trigger - a menu, a select, a popover.
 *
 * **`fireEvent.click`, because `userEvent.click` does not reliably open one.**
 *
 * The trigger press only: typing, keyboard and `pointer` are unaffected, and
 * picking a row *inside* an open panel works under either driver.
 */
export function pressTrigger(trigger: HTMLElement): void {
  fireEvent.click(trigger)
}

/**
 * Press something outside an open overlay, to dismiss it - a dialog's
 * backdrop, the page behind a popover.
 *
 * **Dismissal is decided on the press, not the click**, so `fireEvent.click`
 * alone leaves the overlay open: the handler has already run and seen nothing.
 * A trigger is the opposite and opens on the click, which is why these are two
 * helpers rather than one. Both events go out here so the surface behaves the
 * same whichever half it listens on.
 */
export function pressOutside(target: HTMLElement): void {
  fireEvent.pointerDown(target)
  fireEvent.mouseDown(target)
  fireEvent.click(target)
}
