/**
 * What the picker offers when its list does not arrive, and the door it owes
 * to the shortcuts.
 *
 * What this cannot see is whether any of it is *visible*: jsdom has no CSS.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { sessionRows } from '@/components/blocks/session-menu'

import { PICKER_CASES } from '@/components/blocks/picker-rows'

import { PickerCasesScreen } from './picker-cases'

/** The rail, which must outlive whatever the body is doing. */
function rail(): HTMLElement {
  return screen.getByTestId('picker-rail')
}

describe('the picker when its list does not arrive', () => {
  it('says so, and offers the way back to it', () => {
    render(<PickerCasesScreen cases={undefined} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} problem="The case list could not be read." onRetry={() => undefined} />)

    expect(screen.getByRole('alert').textContent).toContain('The case list could not be read.')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeNull()
  })

  /** Nine other destinations beat one retry, so the failure stays in the body. */
  it('keeps every other destination reachable', () => {
    render(<PickerCasesScreen cases={undefined} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} problem="The case list could not be read." onRetry={() => undefined} />)

    expect(within(rail()).getByText('Accounts')).toBeTruthy()
    expect(within(rail()).getByText('Demo cases')).toBeTruthy()
  })

  it('asks the caller again when it is pressed', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(<PickerCasesScreen cases={undefined} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} problem="The case list could not be read." onRetry={retry} />)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(retry, 'the button cleared the message without asking again').toHaveBeenCalledTimes(1)
  })

  /**
   * A 403 is the server being right about this analyst, and it will refuse every
   * press.
   */
  it('does not offer a retry for a refusal', () => {
    render(
      <PickerCasesScreen
      cases={undefined}
      analyst="r.okonkwo" userMenu={null} onAbout={() => undefined}
        problem={new ApiError(403, 'Insufficient permissions', null)}
        onRetry={() => undefined}
      />,
    )

    expect(screen.getByText('Insufficient permissions')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
      'a refusal was offered a retry that will refuse again',
    ).toBeNull()
  })

  /** Nothing wrong: the panes are drawn and no alert is. */
  it('draws the pane and no alert when nothing failed', () => {
    render(<PickerCasesScreen cases={PICKER_CASES} analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

/**
 * **The door is the product's own rows**, drawn by the block the app hands to
 * both rails.
 */
describe('the picker offers a door to the shortcuts', () => {
  it('carries Keyboard shortcuts in the session menu', async () => {
    const user = userEvent.setup()
    render(
      <PickerCasesScreen
        cases={PICKER_CASES}
        analyst="r.okonkwo"
        userMenu={sessionRows(
          'r.okonkwo',
          'system',
          () => undefined,
          () => undefined,
          () => undefined,
          () => undefined,
        )}
        onAbout={() => undefined}
      />,
    )

    await user.click(within(rail()).getByRole('button', { name: /session menu/i }))

    expect(
      screen.queryByRole('menuitem', { name: /keyboard shortcuts/i }),
      'the only door to the cheat sheet is a chord nobody has been told',
    ).not.toBeNull()
  })
})
