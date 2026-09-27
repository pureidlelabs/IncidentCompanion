import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, fn, userEvent } from 'storybook/test'

import { MergeReview } from './merge-review'

/**
 * The band beside a field another analyst changed while this analyst was
 * changing it.
 *
 * Several analysts work one case at once, and a field is written against the
 * version it was read at. When somebody else stores a different value first,
 * this analyst keeps what they typed and is shown the other value, and nothing
 * is written until they choose which stands.
 */
const meta = {
  title: 'Blocks/Notice/Merge review',
  component: MergeReview,
  args: { onKeep: fn(), onTake: fn() },
} satisfies Meta<typeof MergeReview>

export default meta
type Story = StoryObj<typeof meta>

/** A value quoted beside the analyst's own, with the two presses that settle it. */
export const TwoValues: Story = {
  name: 'Another analyst changed the field',
  args: { field: 'Severity', by: 'A. Okonkwo', theirs: 'critical' },
  play: async ({ canvas, args, step }) => {
    await step('It names the field, who changed it and what they stored', async () => {
      await expect(canvas.getByRole('group', { name: 'A. Okonkwo changed Severity' })).toBeVisible()
      await expect(canvas.getByText(/Theirs: critical/)).toBeVisible()
    })

    await step('Keep mine is the only press that writes', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Keep mine' }))
      await expect(args.onKeep).toHaveBeenCalledTimes(1)
      await expect(args.onTake).not.toHaveBeenCalled()
    })
  },
}

/** The other analyst emptied the field, which is still a value to choose between. */
export const Emptied: Story = {
  name: 'The other value is empty',
  args: { field: 'Customer', by: 'Another analyst', theirs: '' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Theirs: nothing/)).toBeVisible()
  },
}
