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
    // Every cell stays inside the table rather than carrying it wider.
    for (const cell of canvasElement.querySelectorAll('td')) {
      await expect(cell.getBoundingClientRect().right).toBeLessThanOrEqual(table.right + 1)
    }
    // The state is still on screen, which is what truncating the name buys.
    await expect(canvas.getAllByText('active').length).toBeGreaterThan(0)
  },
}
