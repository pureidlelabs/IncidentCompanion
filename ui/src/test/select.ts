import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Driving the kit's `Select` from a test, in the gestures the analyst has.
 */
function triggers(root?: HTMLElement): HTMLElement[] {
  const scope = root ?? document.body
  return [...scope.querySelectorAll<HTMLElement>('[aria-haspopup="listbox"]')]
}

/**
 * The one select answering to `name`.
 */
function triggerNamed(name: string | RegExp, root?: HTMLElement): HTMLElement {
  const matches = (text: string): boolean =>
    typeof name === 'string' ? text.includes(name) : name.test(text)
  const found = triggers(root).filter((node) => {
    const own = node.getAttribute('aria-label')
    if (own !== null && matches(own)) return true
    const ids = (node.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
    return ids.some((id) => {
      const label = node.ownerDocument.getElementById(id)
      // The trigger names itself in that list, and its own text is the value.
      if (label === null || label === node || node.contains(label)) return false
      return matches(label.textContent)
    })
  })
  if (found.length === 0) {
    const offered = triggers(root)
      .map((node) => node.getAttribute('aria-label') ?? node.getAttribute('aria-labelledby'))
      .join(', ')
    throw new Error(`no select named ${String(name)}; the page has: ${offered}`)
  }
  const [first, ...rest] = found
  if (rest.length > 0 || first === undefined) {
    throw new Error(`${String(found.length)} selects answer to ${String(name)}`)
  }
  return first
}

/** The trigger of the select named `name`, for a test asserting on it directly. */
export function selectTrigger(name: string | RegExp, root?: HTMLElement): HTMLElement {
  return triggerNamed(name, root)
}

/** Every select trigger on the page, for a test that picks by what one holds. */
export function selectTriggers(root?: HTMLElement): HTMLElement[] {
  return triggers(root)
}

/**
 * Whether a select named `name` is on the page. For the assertion that used to
 * be `queryByRole('combobox', { name })`.
 */
export function hasSelect(name: string | RegExp, root?: HTMLElement): boolean {
  try {
    triggerNamed(name, root)
    return true
  } catch {
    return false
  }
}

export async function pickFromSelect(
  name: string | RegExp,
  option: string,
  root?: HTMLElement,
): Promise<void> {
  await userEvent.click(triggerNamed(name, root))
  await screen.findByRole('listbox')
  // **By stored value, not by label.** `userEvent.selectOptions` matched a
  // native `<option>`'s value, and the tests that moved here mean the same
  // thing -- `yes`, where the row reads "Yes -- a person died". Matching the
  // label instead would pass on whichever row happens to read that way.
  const row = document.querySelector<HTMLElement>(`[role="option"][data-value="${option}"]`)
  if (!row) {
    const offered = [...document.querySelectorAll('[role="option"]')]
      .map((o) => o.getAttribute('data-value'))
      .join(', ')
    throw new Error(`the select ${String(name)} offers no ${option}; it has: ${offered}`)
  }
  await userEvent.click(row)
}

/** What the trigger currently shows - the chosen option's label, not its value. */
export function selectValue(name: string | RegExp, root?: HTMLElement): string {
  return triggerNamed(name, root).textContent
}

/** Kept so a caller may still scope by a subtree the old way. */
export { within }
