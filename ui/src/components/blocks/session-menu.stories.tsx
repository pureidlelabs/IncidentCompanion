import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger } from '@/components/ui/menu'
import type { Theme } from '@/lib/theme-preference'

import { sessionRows } from './session-menu'

/**
 * The ground is live so the radio group can be exercised; everything else is a
 * no-op, because what signing out does is the caller's business.
 */
function SessionMenu({ analyst }: { analyst: string }) {
  const [theme, setTheme] = useState<Theme>('system')
  return (
    <MenuTrigger>
      <Button variant="outline">Session menu</Button>
      <Menu>
        {sessionRows(
          analyst,
          theme,
          setTheme,
          () => undefined,
          () => undefined,
          () => undefined,
        )}
      </Menu>
    </MenuTrigger>
  )
}

/**
 * The signed-in analyst's own menu, at the foot of both rails: their account,
 * the ground, the shortcuts, and the way out.
 */
const meta = {
  title: 'Blocks/App shell/Session menu',
  component: SessionMenu,
  parameters: { layout: 'centered' },
  args: { analyst: 'analyst@example.test' },
} satisfies Meta<typeof SessionMenu>

export default meta
type Story = StoryObj<typeof meta>

/** Every row the analyst is offered, in the order the rail offers them. */
export const Open: Story = {
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('open the menu', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Session menu' }))
    })

    // The menu renders in a portal, so the document is the scope rather than
    // the canvas.
    const menu = within(document.body)
    await waitFor(async () => {
      await expect(menu.getByRole('menuitem', { name: /your account/i })).toBeVisible()
    })

    await step('the doors the app actually offers', async () => {
      await expect(menu.getByRole('menuitem', { name: /keyboard shortcuts/i })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: /about/i })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: /sign out/i })).toBeVisible()
    })

    await step('the ground is named Ground, not Appearance', async () => {
      await expect(menu.getByText('Ground')).toBeVisible()
    })
  },
}
