import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Driving an `EntityCombobox` from a test, in the gestures the analyst has.
 *
 * Every reference field was a native `<select>` until the picker replaced it,
 * so a suite full of `userEvent.selectOptions(field, 'sys-1')` had to move
 * somewhere. Here rather than inline: the sequence is open, then click the row
 * - and a test that inlined it would be asserting the picker's mechanics from
 * fifteen places, each free to drift from the others.
 *
 * **Picks by id, as `selectOptions` did.** The rows are labelled by name and
 * two rows can share one; naming the id is what keeps a test that means
 * `sys-1` from passing on whichever row happens to read `FS-02`.
 *
 * The rows are `<button role="option">`, so `userEvent.click` never reaches
 * jsdom's own navigation.
 *
 * **`root` scopes the box, never the list.** The list portals to
 * `document.body`, so `within(dialog).getByRole('listbox')` finds nothing -
 * which reads as "the picker offered no rows", not as a scoping mistake.
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
 * not.** The reference chip lists are multiple now, and an open popup makes
 * everything behind it inert - so `within(dialog).getByRole('button', { name:
 * 'Save' })` finds nothing and reads as a dialog that lost its footer.
 *
 * Conditional rather than unconditional: pressing Escape at a list that has
 * already closed itself closes the *dialog* instead, which is the same failure
 * one layer out.
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
