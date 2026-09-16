/**
 * The rail's top card offers what the rows beneath it offer.
 *
 * No other tier can see this. A menu row is built into React Aria's collection
 * and drawn only once somebody opens the menu.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { PickerFrame } from './picker-frame'

const frame = (admin: boolean) =>
  render(
    <PickerFrame
      analyst="r.okonkwo"
      userMenu={null}
      onAbout={() => undefined}
      pane="cases"
      admin={admin}
    >
      <p>A pane</p>
    </PickerFrame>,
  )

const productMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId('rail-header'))
  return screen.findByRole('menu')
}

describe("the picker's product menu", () => {
  it('does not offer an analyst the pane the rail hides from them', async () => {
    const user = userEvent.setup()
    frame(false)

    const menu = await productMenu(user)

    expect(within(menu).queryByRole('menuitem', { name: 'Health' })).toBeNull()
    expect(
      within(menu).getByRole('menuitem', { name: 'About this install' }),
    ).toBeInTheDocument()
  })

  it('offers an administrator the door the rail offers them', async () => {
    const user = userEvent.setup()
    frame(true)

    const menu = await productMenu(user)

    expect(within(menu).getByRole('menuitem', { name: 'Health' })).toBeInTheDocument()
  })

  it('hides it from a frame told nothing, as the rail does', async () => {
    const user = userEvent.setup()
    render(
      <PickerFrame analyst="r.okonkwo" userMenu={null} onAbout={() => undefined} pane="cases">
        <p>A pane</p>
      </PickerFrame>,
    )

    const menu = await productMenu(user)

    expect(within(menu).queryByRole('menuitem', { name: 'Health' })).toBeNull()
  })
})
