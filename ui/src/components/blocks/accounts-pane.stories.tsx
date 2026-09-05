import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, screen, within } from 'storybook/test'

import { AccountsPane, type AccountsPaneProps } from '@/components/blocks/accounts-pane'
import { PICKER_ACCOUNTS } from '@/components/blocks/picker-rows'

/**
 * The screen's half: the pane owns no roster, so the story holds it.
 *
 * The count line is drawn from the same list the table filters, so only a
 * caller holding that list can move one without the other.
 */
function Owned({ accounts, onState, ...rest }: AccountsPaneProps) {
  const [roster, setRoster] = useState(accounts)
  const [given, setGiven] = useState(accounts)
  if (given !== accounts) {
    setGiven(accounts)
    setRoster(accounts)
  }
  return (
    <AccountsPane
      {...rest}
      accounts={roster}
      onState={(id, state) => {
        setRoster((current) => current.map((one) => (one.id === id ? { ...one, state } : one)))
        onState(id, state)
      }}
    />
  )
}

/**
 * Who may sign in to an install, and what each may reach. Draws the account
 * table under its own heading and count line.
 *
 * The count line is the pane's own: three facts about the roster the table is
 * showing, and `disabled` only once there is one to report.
 */
const meta = {
  title: 'Blocks/System/Accounts',
  component: AccountsPane,
  parameters: { layout: 'padded' },
  args: { onNewAccount: fn(), onState: fn() },
  render: (args) => <Owned {...args} />,
} satisfies Meta<typeof AccountsPane>

export default meta
type Story = StoryObj<typeof meta>

/** The roster with nobody disabled, so the third fact has yet to appear. */
const NONE_DISABLED = PICKER_ACCOUNTS.filter((one) => one.state !== 'disabled')

/**
 * The count line reads three facts, and omits the third until it is true: a
 * permanent `0 disabled` is a number nobody acts on.
 */
export const Roster: Story = {
  name: 'Every state the chip has a tone for',
  args: { accounts: PICKER_ACCOUNTS },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('5 accounts \u00b7 1 administrator \u00b7 1 disabled')).toBeVisible()
  },
}

/**
 * No accounts at all draws no count line, because a count of nothing is not a
 * fact worth a line.
 */
export const Empty: Story = {
  name: 'Nobody but you',
  args: { accounts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText(/account[s]? \u00b7/)).not.toBeInTheDocument()
  },
}

/**
 * Disabling an account rewrites the count line, because the pane and the table
 * read the same roster.
 *
 * The third fact appears at the same moment: there is now a disabled account
 * to report, so the line grows from two facts to three.
 */
export const DisablingRewritesTheCount: Story = {
  name: 'Disabling an account rewrites the count line',
  args: { accounts: NONE_DISABLED },
  play: async ({ canvas, step, userEvent, args }) => {
    await expect(canvas.getByText('4 accounts \u00b7 1 administrator')).toBeVisible()

    await step('disable an account from its row menu', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'More for Tomas Brennan' }))
      const menu = await screen.findByRole('menu', { name: 'More for Tomas Brennan' })
      await userEvent.click(within(menu).getByRole('menuitem', { name: /disable/i }))
    })

    await expect(
      await canvas.findByText('4 accounts \u00b7 1 administrator \u00b7 1 disabled'),
    ).toBeVisible()
    await expect(args.onState).toHaveBeenCalledWith('a2', 'disabled')
  },
}

/**
 * The mint-an-account door is the pane's own control, and reports rather than
 * opening anything itself.
 */
export const NewAccount: Story = {
  name: 'Opening the mint-an-account door',
  args: { accounts: PICKER_ACCOUNTS },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /new account/i }))
    await expect(args.onNewAccount).toHaveBeenCalled()
  },
}

/**
 * A roster the size a large install reaches.
 *
 * The count line is what has to survive it: three facts on one line, whatever
 * the numbers are, rather than wrapping under the heading and pushing the
 * table down.
 */
export const TooMuchData: Story = {
  name: 'Six hundred accounts',
  args: {
    accounts: Array.from({ length: 600 }, (_, i) => ({
      id: `bulk-${String(i)}`,
      username: `user.${String(i)}`,
      displayName: i % 5 === 0 ? '' : `Person Number ${String(i)}`,
      role: i % 12 === 0 ? 'admin' : 'analyst',
      state: i % 7 === 0 ? 'disabled' : 'active',
    })),
  },
  play: async ({ canvas, canvasElement }) => {
    const line = canvas.getByText(/600 accounts/)
    await expect(line).toBeVisible()

    // One line, not two: its height is a single line's leading.
    const leading = Number.parseFloat(getComputedStyle(line).lineHeight)
    await expect(line.getBoundingClientRect().height).toBeLessThan(leading * 1.6)
    await expect(canvasElement.querySelector('table')).not.toBeNull()
  },
}
