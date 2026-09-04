import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent } from 'storybook/test'
import {
  AUDIT_BOUNDS,
  PICKER_REGIMES,
  SESSION_BOUNDS,
  SIGN_IN_BOUNDS,
  LIMIT_BOUNDS,
  ABSENT_SIGN_IN,
  ABSENT_FORWARDING,
} from './picker-rows'

import { AdministrationPane } from '@/components/blocks/administration-pane'
import { PICKER_ACCOUNTS } from '@/components/blocks/picker-rows'

/**
 * What this installation is set to, and who may reach it: audit, compliance,
 * the account roster, sign-in, limits and forwarding, each its own settings
 * card.
 *
 * **Five of the six cards are unsettable and say so in their titles.** No route
 * takes a retention bound, a sign-in bound or a forwarding target, so every
 * control in them is refused rather than left to report a change this install
 * cannot keep. The roster is the one card that acts. -> issue #50
 *
 * The load that varies here is *how much the server served*, and the states
 * below are the four an operator actually meets.
 */
const meta = {
  title: 'Blocks/System/Administration',
  component: AdministrationPane,
  parameters: { layout: 'padded' },
  args: { onAccountState: fn() },
} satisfies Meta<typeof AdministrationPane>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every card filled, which is the only shape that shows the settings sections
 * and the account roster in one column.
 *
 * The shape to judge the layout on, and not one any install currently serves.
 */
export const Default: Story = {
  args: {
    accounts: PICKER_ACCOUNTS,
    audit: AUDIT_BOUNDS,
    regimes: PICKER_REGIMES,
    signIn: SIGN_IN_BOUNDS,
    limits: LIMIT_BOUNDS,
    absentSignIn: ABSENT_SIGN_IN,
    absentForwarding: ABSENT_FORWARDING,
  },
  play: async ({ canvas, step }) => {
    await step('all six cards are drawn', async () => {
      for (const title of [
        'Audit [soon]',
        'Compliance [soon]',
        'Accounts',
        'Sign-in',
        'Limits',
        'Forwarding [soon]',
      ]) {
        await expect(canvas.getByText(title)).toBeVisible()
      }
    })
    await step('and nothing unsettable is left settable', async () => {
      const switches = canvas.getAllByRole('switch')
      for (const one of switches) await expect(one).toBeDisabled()
      await expect(canvas.getByRole('button', { name: /Open the log/ })).toBeDisabled()
    })
  },
}

/**
 * What the picker screen actually passes.
 *
 * `GET /api/install/policy` serves the two session windows with the bounds the
 * server enforces, and `PUT` takes them, so those rows are drawn and settable.
 * Retention, the regimes and the two absent-setting lists are served by
 * nothing, so the screen hands them `undefined` rather than filling them from a
 * sample -- an invented retention period is a number an operator would act on.
 *
 * **The cards stay.** A card that vanished when its data did would tell an
 * operator the setting does not exist, when what is true is that this install
 * cannot answer for it yet. -> issue #50
 */
/** The spy the settable rows report to, so the press below has somewhere to land. */
const chose = fn()

export const AsTheScreenPassesIt: Story = {
  name: 'Only what the server serves',
  args: {
    accounts: PICKER_ACCOUNTS,
    audit: undefined,
    regimes: undefined,
    signIn: SESSION_BOUNDS.map((row) => ({ ...row, onChoose: chose })),
    limits: LIMIT_BOUNDS,
    absentSignIn: undefined,
    absentForwarding: undefined,
  },
  play: async ({ canvas, step }) => {
    await step('every card is still drawn, empty or not', async () => {
      await expect(canvas.getByText('Audit [soon]')).toBeVisible()
      await expect(canvas.getByText('Forwarding [soon]')).toBeVisible()
    })
    await step('the one thing served is drawn', async () => {
      await expect(canvas.getByText('Limits')).toBeVisible()
    })
    await step('and the two windows an install sets are settable', async () => {
      for (const label of ['Sign out when idle for', 'Sign out after']) {
        await expect(canvas.getByLabelText(label)).toBeEnabled()
      }
    })
    await step('a choice reaches the caller, which is what writes it', async () => {
      await userEvent.click(canvas.getByLabelText('Sign out when idle for'))
      // The list is a popover, so it is outside the story's own canvas.
      await userEvent.click(await screen.findByRole('option', { name: '1 hour' }))
      await expect(chose).toHaveBeenCalledWith('1 hour')
    })
    await step('and nothing is invented where nothing was served', async () => {
      await expect(canvas.queryByText(/90 days/)).toBeNull()
      await expect(canvas.queryByRole('switch')).toBeNull()
    })
  },
}

/**
 * A settings list served as empty rather than absent.
 *
 * Indistinguishable from `undefined` on screen, and that is correct: both mean
 * *this install has nothing to show here*, and a card that told them apart
 * would be reporting on the transport rather than on the install.
 */
export const NothingServed: Story = {
  name: 'The server answered with nothing',
  args: {
    accounts: [],
    audit: [],
    regimes: [],
    signIn: [],
    limits: [],
    absentSignIn: [],
    absentForwarding: [],
  },
  play: async ({ canvas, step }) => {
    await step('the pane keeps its shape', async () => {
      await expect(canvas.getByText('Administration')).toBeVisible()
      await expect(canvas.getByText('Limits')).toBeVisible()
    })
    await step('and the roster draws its own empty state', async () => {
      await expect(canvas.queryAllByRole('switch')).toHaveLength(0)
    })
  },
}

/**
 * The one card that acts.
 *
 * Every other control here is refused, so this is the whole of what an operator
 * can change from this pane. The roster is the caller's -- the pane reports the
 * change and holds no copy, which is what stops the count above a table and the
 * table itself disagreeing.
 */
export const TheRosterActs: Story = {
  name: 'Disabling an account',
  args: {
    accounts: PICKER_ACCOUNTS,
    audit: AUDIT_BOUNDS,
    regimes: PICKER_REGIMES,
    signIn: SIGN_IN_BOUNDS,
    limits: LIMIT_BOUNDS,
    absentSignIn: ABSENT_SIGN_IN,
    absentForwarding: ABSENT_FORWARDING,
  },
  play: async ({ args, canvas, step }) => {
    // The first account is active, so its menu offers Disable. Named rather
    // than searched: a `find` that matched nothing would leave this story
    // passing on an empty menu. The row is labelled by its display name.
    const account = PICKER_ACCOUNTS[0]!
    await step('the row offers the state its account is not in', async () => {
      await userEvent.click(
        canvas.getByRole('button', { name: `More for ${account.displayName}` }),
      )
      await expect(
        await screen.findByRole('menuitem', { name: 'Disable\u2026' }),
      ).toBeInTheDocument()
    })
    await step('and the change is reported rather than held here', async () => {
      await userEvent.click(screen.getByRole('menuitem', { name: 'Disable\u2026' }))
      await expect(args.onAccountState).toHaveBeenCalledWith(account.id, 'disabled')
    })
  },
}
