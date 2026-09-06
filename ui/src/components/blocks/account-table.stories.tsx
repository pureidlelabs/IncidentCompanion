import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, screen, within } from 'storybook/test'

import {
  AccountTable,
  type AccountRow,
  type AccountTableProps,
} from '@/components/blocks/account-table'
import { PICKER_ACCOUNTS } from '@/components/blocks/picker-rows'

/**
 * The screen's half, so a story exercises what a screen wires rather than what
 * the block could do alone.
 *
 * `AccountTable` owns no roster: enabling and disabling are the caller's, and
 * a story that held neither would draw a table whose rows never move. The arg
 * is still called, so a spy sees every state change.
 */
function Owned({ accounts, onState }: AccountTableProps) {
  const [roster, setRoster] = useState(accounts)
  const [given, setGiven] = useState(accounts)
  if (given !== accounts) {
    setGiven(accounts)
    setRoster(accounts)
  }
  return (
    <AccountTable
      accounts={roster}
      onState={(id, state) => {
        setRoster((current) => current.map((one) => (one.id === id ? { ...one, state } : one)))
        onState(id, state)
      }}
    />
  )
}

/**
 * Who may sign in to an install: three tabs by state, a search-and-role
 * toolbar, and the account table.
 *
 * Draws no heading, so a caller wraps it in its own `Section` or
 * `SettingsSection` - the picker's Accounts pane and its Administration pane
 * both do, over the same table.
 *
 * The three controls compose: a tab, a role and a search narrow the same list
 * together, and `Show every account` is the one control that undoes all three.
 */
const meta = {
  title: 'Blocks/System/Account table',
  component: AccountTable,
  parameters: { layout: 'padded' },
  args: { onState: fn() },
  render: (args) => <Owned {...args} />,
} satisfies Meta<typeof AccountTable>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every state the chip has a tone for, and the blank display name falling
 * back to the username.
 */
export const Roster: Story = {
  name: 'Every state the chip has a tone for',
  args: { accounts: PICKER_ACCOUNTS },
}

/**
 * No accounts at all, which is a different sentence from none matching: the
 * empty state offers nothing to undo, because nothing was narrowed.
 */
export const Empty: Story = {
  name: 'Nobody but you',
  args: { accounts: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nobody but you')).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: /show every account/i }),
    ).not.toBeInTheDocument()
  },
}

/**
 * A search that matches nothing says so, and offers the way back.
 *
 * The empty state is the same component either way; `narrowed` is what picks
 * the words, so this pairs with `Empty` above.
 */
export const NothingMatches: Story = {
  name: 'A search that matches nothing',
  args: { accounts: PICKER_ACCOUNTS },
  play: async ({ canvas, step, userEvent }) => {
    await step('search for somebody who is not here', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Account contains' }), 'zzz')
    })

    await expect(await canvas.findByText('Nothing matches')).toBeVisible()

    await step('take the way back', async () => {
      await userEvent.click(canvas.getByRole('button', { name: /show every account/i }))
    })

    await expect(await canvas.findByText('Rachel Okonkwo')).toBeVisible()
  },
}

/**
 * A tab and a search narrow together rather than replacing one another.
 *
 * Each control on its own is the kit's; that they compose is this block's, and
 * is what a screen relies on.
 */
export const TabAndSearchCompose: Story = {
  name: 'A tab and a search narrow together',
  args: { accounts: PICKER_ACCOUNTS },
  play: async ({ canvas, step, userEvent }) => {
    await step('narrow to the active accounts', async () => {
      await userEvent.click(canvas.getByRole('tab', { name: /active/i }))
    })

    // The tab's own narrowing, asserted before the search can account for it:
    // the locked-out and disabled rows are the two it drops.
    await expect(await canvas.findByText('Tomas Brennan')).toBeVisible()
    await expect(canvas.queryByText('Margot Delacroix')).not.toBeInTheDocument()
    await expect(canvas.queryByText('d.novak')).not.toBeInTheDocument()

    await step('and search within them', async () => {
      await userEvent.type(canvas.getByRole('textbox', { name: 'Account contains' }), 'rachel')
    })

    await expect(await canvas.findByText('Rachel Okonkwo')).toBeVisible()
    await expect(canvas.queryByText('Tomas Brennan')).not.toBeInTheDocument()
  },
}

/** One of the three states, by position, so the generated roster holds all of them. */
function stateFor(i: number): AccountRow['state'] {
  if (i % 3 === 1) return 'disabled'
  if (i % 3 === 2) return 'locked out'
  return 'active'
}

/**
 * A roster the length an install actually reaches, filled from `args` the way
 * a screen fills it.
 *
 * The block holds no data of its own, so the volume it composes under is set
 * entirely by what the screen passes: the tab counts, the role filter's own
 * counts and the scrolling table all derive from this one arg.
 */
export const AFullInstall: Story = {
  name: 'A roster of two hundred',
  args: {
    accounts: Array.from({ length: 200 }, (_, i) => ({
      id: `a${String(i)}`,
      username: `user.${String(i)}`,
      displayName: i % 7 === 0 ? '' : `Person Number ${String(i)}`,
      role: i % 11 === 0 ? 'admin' : 'analyst',
      state: stateFor(i),
    })),
  },
  play: async ({ canvas, args }) => {
    const active = args.accounts.filter((one) => one.state === 'active').length
    await expect(canvas.getByRole('tab', { name: /^all/i })).toHaveTextContent(
      String(args.accounts.length),
    )
    await expect(canvas.getByRole('tab', { name: /active/i })).toHaveTextContent(String(active))
  },
}

/**
 * Disabling an account moves it between tabs, and the counts follow it.
 *
 * The row leaving the table and the tab still claiming it are the two halves
 * of one fact, and a count that disagrees with the rows under it is the
 * failure an administrator acts on.
 */
export const DisablingMovesTheCount: Story = {
  name: 'Disabling an account moves the count with the row',
  args: { accounts: PICKER_ACCOUNTS },
  play: async ({ canvas, step, userEvent, args }) => {
    await expect(canvas.getByRole('tab', { name: /active/i })).toHaveTextContent('3')
    await expect(canvas.getByRole('tab', { name: /disabled/i })).toHaveTextContent('1')

    await step('disable an active account from its row menu', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'More for Rachel Okonkwo' }))
      // The menu portals to the body, so it is off the story's own canvas.
      const menu = await screen.findByRole('menu', { name: 'More for Rachel Okonkwo' })
      await userEvent.click(within(menu).getByRole('menuitem', { name: /disable/i }))
    })

    await expect(canvas.getByRole('tab', { name: /active/i })).toHaveTextContent('2')
    await expect(canvas.getByRole('tab', { name: /disabled/i })).toHaveTextContent('2')
    await expect(args.onState).toHaveBeenCalledWith('a1', 'disabled')
  },
}

/**
 * The longest name and username an install would hold.
 *
 * The Account column truncates rather than widening: it shares a row with the
 * role, the auth chips and the state, and a column that grew with its content
 * would push the state off the end of the table.
 */
export const TheLongestText: Story = {
  name: 'A name nobody thought would be that long',
  args: {
    accounts: [
      {
        id: 'long',
        username: 'margot.delacroix-vandenberghe@partner.example.corp',
        displayName: 'Margot Delacroix-Vandenberghe (Incident Response, Contractor)',
        role: 'analyst',
        state: 'active',
      },
      ...PICKER_ACCOUNTS.slice(0, 2),
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    const table = canvasElement.querySelector('table')!.getBoundingClientRect()
    for (const cell of canvasElement.querySelectorAll('td')) {
      await expect(cell.getBoundingClientRect().right).toBeLessThanOrEqual(table.right + 1)
    }
    // The state is still on screen, which is what truncating the name buys.
    await expect(canvas.getAllByText('active').length).toBeGreaterThan(0)
  },
}
