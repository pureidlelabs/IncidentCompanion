import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { AccountProfileSection, type AccountProfileWrites } from '@/components/blocks/account-profile-section'

/**
 * The analyst's own name, picture and colour: a settings section whose
 * `tone` and `initials` are values and whose `writes` carries what a change
 * sends. Every story here omits `writes`, so a choice redraws the preview and
 * reaches nowhere -- `PressingEachControl` is the one that supplies it.
 */
const meta = {
  title: 'Blocks/Form/Account profile section',
  component: AccountProfileSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AccountProfileSection>

export default meta
type Story = StoryObj<typeof meta>

/** A new account: no picture, no colour chosen, no initials typed. */
export const Fresh: Story = {
  name: 'Nobody has set anything up',
  args: { name: 'r.okonkwo' },
  play: async ({ canvas, step }) => {
    await step('the section still names who it is for', async () => {
      await expect(canvas.getByText('r.okonkwo')).toBeVisible()
    })
    await step('and nothing offers to remove a picture there is none of', async () => {
      await expect(canvas.queryByRole('button', { name: /remove/i })).toBeNull()
    })
  },
}

/** Picture stored, colour chosen, initials typed - every row answered. */
export const Populated: Story = {
  name: 'Every row answered',
  args: { name: 'r.okonkwo', hasPicture: true, tone: 1, initials: 'RO' },
  play: async ({ canvas, step }) => {
    await step('a stored picture can be taken away again', async () => {
      await expect(canvas.getByRole('button', { name: /remove/i })).toBeVisible()
    })
    await step('and the typed initials are the value, not a placeholder', async () => {
      await expect(canvas.getByDisplayValue('RO')).toBeInTheDocument()
    })
  },
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
    name: 'r.okonkwo',
    pictureRefusal: 'That file is 4.2MB. The largest this install stores is 2MB.',
  },
  play: async ({ canvas, step }) => {
    await step('the refusal names the size and the ceiling', async () => {
      await expect(
        canvas.getByText('That file is 4.2MB. The largest this install stores is 2MB.'),
      ).toBeVisible()
    })
    await step('and the control that sent them is not itself marked wrong', async () => {
      const choose = canvas.getByRole('button', { name: /choose|upload|picture/i })
      await expect(choose).toBeEnabled()
      await expect(choose).not.toHaveAttribute('aria-invalid', 'true')
    })
  },
}

/**
 * A service account name past the row it sits in.
 *
 * The name truncates beside the avatar rather than pushing the row wide.
 */
export const Overlong: Story = {
  name: 'A name too long for its row',
  args: {
    name: 'soc-duty-analyst-rotation-weekend@meridian-logistics-group.example.internal',
    hasPicture: true,
    initials: 'SD',
  },
  play: async ({ canvasElement, canvas, step }) => {
    await step('the whole name is present, however much of it shows', async () => {
      await expect(
        canvas.getByText(
          'soc-duty-analyst-rotation-weekend@meridian-logistics-group.example.internal',
        ),
      ).toBeInTheDocument()
    })
    await step('and it does not push the section wider than its parent', async () => {
      // Browser-only: jsdom gives every box a zero width, so this assertion is
      // vacuously true there and means something only in the story tier.
      const section = canvasElement.firstElementChild as HTMLElement
      await expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth + 1)
    })
  },
}

function someFile(name = 'badge.png'): File {
  return new File(['not-actually-a-png'], name, { type: 'image/png' })
}

function spying(): AccountProfileWrites {
  return {
    setPicture: fn(),
    clearPicture: fn(),
    setTone: fn(),
    setInitials: fn(),
  }
}

/**
 * Every control pressed, and what left through `writes`.
 *
 * The colour click writes immediately; the initials field writes on blur,
 * the same trigger `CaseRecordForm` uses and for the same reason -- a field
 * an analyst is still typing into is not yet a change.
 */
export const PressingEachControl: Story = {
  name: 'Pressing every control',
  args: { name: 'r.okonkwo', writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByLabelText('Colour 2'))
    await expect(args.writes!.setTone).toHaveBeenCalledWith(1)

    await userEvent.click(canvas.getByLabelText('Automatic'))
    await expect(args.writes!.setTone).toHaveBeenCalledWith(null)

    const initials = canvas.getByLabelText('Initials')
    await userEvent.type(initials, 'RO')
    await userEvent.tab()
    await expect(args.writes!.setInitials).toHaveBeenCalledWith('RO')

    const input = canvasElement.ownerDocument.body.querySelector('input[type="file"]')
    await userEvent.upload(input as HTMLInputElement, someFile())
    await expect(args.writes!.setPicture).toHaveBeenCalledTimes(1)
    const uploaded = (args.writes!.setPicture as unknown as { mock: { calls: [File][] } }).mock
      .calls[0]![0]
    await expect(uploaded.name).toBe('badge.png')

    await userEvent.click(canvas.getByRole('button', { name: 'Remove' }))
    await expect(args.writes!.clearPicture).toHaveBeenCalled()
  },
}
