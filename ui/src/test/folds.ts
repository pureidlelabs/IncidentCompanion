import userEvent from '@testing-library/user-event'

/**
 * Open every shut fold in a form, so a test can reach a subordinate field.
 *
 * **A form dialog no longer shows every field at once.** `FormSection` folds
 * the run the served spec marks `subordinate` - 11 of the event form's 18 -
 * behind a per-section disclosure, so a test looking for a link picker on a
 * freshly opened dialog finds nothing. That is the feature, not a regression:
 * an analyst fills three or four fields and used to be handed eighteen.
 *
 * **One helper rather than a click in each test**, because the alternative was
 * eleven tests each spelling the disclosure their own way - which is how this
 * project came to have two rail rows and three filter bars. The button is found
 * by its `data-fold` handle rather than its wording, so a fold that is
 * relabelled does not send eleven files looking for a string. The handle
 * exists because `aria-expanded` is not specific enough on its own: a select
 * trigger and a row's chevron carry it too.
 *
 * A test that means to assert *what the analyst sees first* must not call this.
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
