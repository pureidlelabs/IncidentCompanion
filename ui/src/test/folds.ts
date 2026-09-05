import userEvent from '@testing-library/user-event'

/**
 * Open every shut fold in a form, so a test can reach a subordinate field.
 */
export async function openFolds(scope: HTMLElement): Promise<void> {
  // Re-read between clicks: opening one fold re-renders the section, so a list
  // collected up front holds detached nodes by the second press.
  for (;;) {
    // **Two folds deep, in that order.** A section's disclosure opens the
    // group; each field inside it is then its own `FieldRow`, disclosed
    // separately - the band shape both dialogs draw. Opening the group first
    // is what puts the rows in the tree at all.
    const group = scope.querySelector<HTMLElement>('[data-fold][aria-expanded="false"]')
    const row =
      group ??
      scope.querySelector<HTMLElement>(
        '[data-slot="field-row"]:not([data-open]) [aria-expanded="false"]',
      )
    if (row === null) return
    await userEvent.click(row)
  }
}
