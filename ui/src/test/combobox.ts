import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Driving an `EntityCombobox` from a test, in the gestures the analyst has.
 */

function openPicker(name: string | RegExp, root: HTMLElement | undefined) {
  const scope = root ? within(root) : screen
  return scope.getByRole('combobox', { name })
}

/** The portalled list for the picker named `name`. */
function openList(name: string | RegExp) {
  return screen.getByRole('listbox', { name })
}

/** Open the picker named `name` and click the row for entity `id`. */
export async function pickFromCombobox(
  name: string | RegExp,
  id: string,
  root?: HTMLElement,
): Promise<void> {
  const box = openPicker(name, root)
  await userEvent.click(box)
  const list = openList(name)
  const row = list.querySelector<HTMLElement>(`[role="option"][data-entity-id="${id}"]`)
  if (!row) throw new Error(`the picker "${String(name)}" offers no row for ${id}`)
  await userEvent.click(row)
  await closeIfStillOpen(box)
}

/**
 * **A multiselect keeps its list open after a pick, and a single-select does
 * not.**
 */
async function closeIfStillOpen(box: HTMLElement): Promise<void> {
  // **Asked of the box's state, not of whether the list is in the tree.** A
  // popover is held mounted while its exit animation runs, so a list that has
  // already closed is still findable for a frame - and an Escape sent at it
  // reaches the *dialog*, which is the failure the paragraph above describes
  // one layer out. `aria-expanded` is the state; the mount is not.
  if (box.getAttribute('aria-expanded') !== 'true') return
  await userEvent.keyboard('{Escape}')
}

/** Open the picker named `name` and click its create row. */
export async function pickCreateRow(
  name: string | RegExp,
  createLabel: string | RegExp,
  root?: HTMLElement,
): Promise<void> {
  const box = openPicker(name, root)
  await userEvent.click(box)
  await userEvent.click(within(openList(name)).getByRole('option', { name: createLabel }))
  await closeIfStillOpen(box)
}

/** The rows the picker named `name` offers, by label and in order. */
export async function comboboxRows(name: string | RegExp, root?: HTMLElement): Promise<string[]> {
  await userEvent.click(openPicker(name, root))
  return within(openList(name))
    .queryAllByRole('option')
    .map((option) => option.textContent)
}
