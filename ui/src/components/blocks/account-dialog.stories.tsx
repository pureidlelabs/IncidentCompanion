import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import type { AccountProfileWrites } from '@/components/blocks/account-profile-section'
import { Button } from '@/components/ui/button'

import { AccountDialog, AccountPanel } from './account-dialog'

/**
 * One analyst's own screen, and the only settings surface that is theirs.
 *
 * Read it against what is missing as much as what is here: no display name, no
 * sign-in address, no role, no length hint under the new password, and no
 * time-display control. Each is absent for a stated reason.
 *
 * `ground` and the profile fields are values here too; every story but
 * `PressingTheSeams` omits the change seams, so the controls redraw and reach
 * nowhere.
 */
const meta = {
  title: 'Blocks/Overlay/Account',
  component: AccountPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AccountPanel>

export default meta
type Story = StoryObj<typeof meta>

/** A new account: no picture, no colour chosen, no initials typed. */
export const Fresh: Story = {
  name: 'An account nobody has set up',
  play: async ({ canvas, step }) => {
    await step('the rows an analyst may actually change are here', async () => {
      await expect(canvas.getByText('Ground')).toBeVisible()
      await expect(canvas.getByText('Authenticator app')).toBeVisible()
    })
    await step('and each stated absence really is absent', async () => {
      // The claim this screen is documented by is what it does *not* offer.
      // A display name, a sign-in address, a role and a time-display control
      // are all set elsewhere or not at all, so drawing them here would be a
      // control that reports a change this screen cannot keep.
      for (const missing of [/Display name/i, /Sign-in address/i, /^Role$/, /Time display/i]) {
        await expect(canvas.queryByText(missing)).toBeNull()
      }
    })
  },
}

/** Picture stored, colour chosen, initials typed - every row answered. */
export const Populated: Story = {
  name: 'Every row answered',
  args: { hasPicture: true, tone: 1, initials: 'RO' },
}

/**
 * A picture the server would not store.
 *
 * The refusal is a row of its own rather than a line under the button: the
 * bytes were judged, not the control that sent them.
 */
export const PictureRefused: Story = {
  name: 'A picture the server refused',
  args: {
    pictureRefusal: 'That file is 4.2MB. The largest this install stores is 2MB.',
  },
}

/**
 * The password refused, in the server's own words.
 *
 * The field carries no length hint, so the number in this message is the only
 * place the shortest password is ever stated.
 */
export const PasswordRefused: Story = {
  name: 'A password change refused',
  args: {
    tone: 0,
    initials: 'RO',
    passwordRefusal: 'A password on this install is at least 14 characters.',
  },
  play: async ({ canvas, step }) => {
    await step('the refusal states the length', async () => {
      // The field carries no hint, so this message is the only place the
      // shortest password is ever named. A refusal that said "too short"
      // would leave an analyst guessing at the number.
      await expect(
        canvas.getByText('A password on this install is at least 14 characters.'),
      ).toBeVisible()
    })
    await step('and it is the only place that number is said', async () => {
      // A hint under the field as well would be a second copy to keep true.
      await expect(canvas.getAllByText(/at least 14/)).toHaveLength(1)
    })
  },
}

/** The change went through, and the other sessions are still running. */
export const PasswordChanged: Story = {
  name: 'A password just changed',
  args: { tone: 2, initials: 'RO', passwordChanged: true },
}

/**
 * A 420px pane.
 *
 * The rows stack below the `@md` container width: the label goes above the
 * control instead of beside it, and the swatches keep their row.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <AccountPanel {...args} />
    </div>
  ),
  args: { hasPicture: true, tone: 1, initials: 'RO' },
}

/**
 * A service account name past the row it sits in.
 *
 * The name truncates beside the avatar rather than pushing the row wide, and
 * the refusal wraps inside its alert.
 */
export const Overlong: Story = {
  name: 'A name too long for its row',
  args: {
    name: 'soc-duty-analyst-rotation-weekend@meridian-logistics-group.example.internal',
    hasPicture: true,
    initials: 'SD',
    passwordRefusal:
      'A password on this install is at least 14 characters, and may not be one of the ten thousand most common passwords in the breach corpus this install checks against.',
  },
}

function spyingProfile(): AccountProfileWrites {
  return {
    setPicture: fn(),
    clearPicture: fn(),
    setTone: fn(),
    setInitials: fn(),
  }
}

/**
 * The ground select and a profile control, pressed, and what left through
 * each seam.
 *
 * The ground fires on selection; the profile write is the block's own, and
 * this story only proves the screen hands it through rather than swallowing
 * it -- `PressingEachControl` on the block owns the full set.
 */
export const PressingTheSeams: Story = {
  name: 'Pressing the ground and a profile control',
  args: { onGroundChange: fn(), profileWrites: spyingProfile() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: /Ground/ }))
    await userEvent.click(body.getByRole('option', { name: 'Dark' }))
    await expect(args.onGroundChange).toHaveBeenCalledWith('dark')

    await userEvent.click(canvas.getByLabelText('Colour 2'))
    await expect(args.profileWrites!.setTone).toHaveBeenCalledWith(1)
  },
}

/**
 * The screen as the app raises it: a dialog over whatever the analyst is on,
 * opened from the rail's user menu.
 *
 * Opened by a press. A modal opened on mount stacks un-dismissably in the docs
 * page, so every story above draws the panel bare.
 */
export const AsTheAppOpensIt: Story = {
  name: 'Raised from the user menu',
  render: () => {
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            Your account
          </Button>
          <AccountDialog isOpen={open} onOpenChange={setOpen} />
        </>
      )
    }
    return <Controlled />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Your account' }))
    // Presence, never `toBeVisible`: the overlay settles at opacity 0 here.
    await waitFor(() => {
      void expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      void expect(document.querySelector('[role="dialog"]')).toBeNull()
    })
  },
}
