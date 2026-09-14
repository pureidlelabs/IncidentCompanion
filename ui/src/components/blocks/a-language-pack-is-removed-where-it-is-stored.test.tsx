/**
 * **Removing a language pack removes it from the install, not from the table.**
 *
 * The pane's Remove control filtered the row out of local state, so the pack
 * came back on the next fetch and nothing had been deleted -- an analyst is
 * told a thing happened that did not, and only finds out by reloading.
 * `useLanguageRemove` was written, tested, and called by nothing. -> #664
 *
 * **Upload was disabled behind a comment saying there is no route**, ten lines
 * from the hook that puts a pack at one. A control that answers a press with
 * nothing is the shape this project refuses; a control disabled on a false
 * statement is worse, because it says the product cannot do what it does.
 *
 * **What this does not cover:** what the server does with the bytes, which is
 * `report/language.controller.ts`'s, and whether a pack is well formed, which
 * is its schema's.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LanguagesPane } from './languages-pane'
import type { LanguageRow } from './picker-rows'

const HELD: LanguageRow[] = [
  { id: 'nl', code: 'nl', label: 'Nederlands', coverage: 1, builtin: false },
  { id: 'en', code: 'en', label: 'English', coverage: 1, builtin: true },
]

const draw = (over: Partial<Parameters<typeof LanguagesPane>[0]> = {}) => {
  const onRemove = vi.fn()
  const onUpload = vi.fn()
  render(
    <LanguagesPane
      languages={HELD}
      keyCount={139}
      onRemove={onRemove}
      onUpload={onUpload}
      {...over}
    />,
  )
  return { onRemove, onUpload }
}

/** Press a row's actions trigger and then the item it offers. */
const chooseRemove = async (label: string) => {
  await userEvent.click(await screen.findByRole('button', { name: `More for ${label}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /remove/i }))
}

/** Choose the removal and answer the question it asks. */
const confirmRemove = async (label: string) => {
  await chooseRemove(label)
  await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
}

describe('the language packs pane', () => {
  it('asks the install to remove a pack rather than hiding the row', async () => {
    const { onRemove } = draw()

    await confirmRemove('Nederlands')

    await waitFor(() => {
      expect(
        onRemove,
        'the row was filtered out of local state, so the pack is still on the install and ' +
          'comes back on the next fetch',
      ).toHaveBeenCalledWith('nl')
    })
  })

  /**
   * **The row stays until the install says it is gone.** Hiding it first shows
   * an analyst a pack that is still there if the call is refused.
   */
  it('keeps the row on screen until the list is read again', async () => {
    draw()

    await confirmRemove('Nederlands')

    expect(screen.getByText('Nederlands')).toBeDefined()
  })

  /**
   * **Asked before it goes.** Removing a pack is an install-wide write no route
   * can undo -- there is no export to put one back from -- so the menu item's
   * own ellipsis promises a further step, and this is that step existing.
   */
  it('asks before removing, naming the pack and what stops being possible', async () => {
    const { onRemove } = draw()

    await chooseRemove('Nederlands')

    const asking = await screen.findByRole('alertdialog')
    expect(asking.textContent).toContain('Nederlands')
    expect(
      asking.textContent,
      'the question does not say what removal costs, so it asks for a decision it withheld ' +
        'the grounds for',
    ).toMatch(/falls back to English/i)
    expect(
      onRemove,
      'the pack went without being asked about, and there is nothing to put it back',
    ).not.toHaveBeenCalled()
  })

  /** Backing out of the question leaves the install alone. */
  it('does not remove a pack when the question is dismissed', async () => {
    const { onRemove } = draw()

    await chooseRemove('Nederlands')
    await userEvent.click(await screen.findByRole('button', { name: /^cancel$/i }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByText('Nederlands')).toBeDefined()
  })

  it('offers upload rather than disabling it on a route that exists', async () => {
    draw()

    const upload = await screen.findByRole('button', { name: /upload a pack/i })

    expect(
      upload.hasAttribute('disabled') || upload.getAttribute('aria-disabled') === 'true',
      'the control is disabled behind a comment saying there is no route, and the hook ' +
        'beside it puts a pack at one',
    ).toBe(false)
  })

  /**
   * **The count is the install's, not a number in the bundle.** The same
   * response carries `keyCount`, and a hard-coded one drifts the first time a
   * string is added.
   */
  it('says how many strings a complete pack carries, as served', () => {
    draw({ keyCount: 500 })

    expect(screen.getByText(/500 strings/)).toBeDefined()
  })

  /** A pack shipped with the app cannot be removed, so it offers no control. */
  it('offers no remove for a pack the app ships', async () => {
    draw()

    await userEvent.click(await screen.findByRole('button', { name: 'More for English' }))

    expect(screen.queryByRole('menuitem', { name: /remove/i })).toBeNull()
  })
})
