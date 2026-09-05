import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { AddAction, CountBadge } from '@/components/blocks/section-head'
import { Section } from '@/components/blocks/section'

/**
 * The count and the add door a collection section puts either side of its
 * title.
 *
 * The count owns its own pluralisation and the narrowed form, which nine
 * screens were each writing as a ternary.
 */
const meta = {
  title: 'Blocks/Layout/Section head',
  component: CountBadge,
  parameters: { layout: 'padded' },
  args: { total: 12, noun: 'task' },
} satisfies Meta<typeof CountBadge>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A count on its own: what the section holds, with nothing narrowing it.
 *
 * The noun follows the number rather than leading it, so the badge reads as a
 * quantity of something rather than as a label with a figure appended.
 */
export const Total: Story = {
  play: async ({ canvas, step }) => {
    await step('the count is written with its noun', async () => {
      await expect(canvas.getByText('12 tasks')).toBeVisible()
    })
  },
}

/** One is the case a bare `${n} ${noun}s` gets wrong. */
export const One: Story = {
  args: { total: 1, noun: 'record' },
  play: async ({ canvas, step }) => {
    await step('the singular is used rather than appending an s', async () => {
      await expect(canvas.getByText('1 record')).toBeVisible()
    })
  },
}

/** Zero is a state the section is in, not an absence: the badge stays. */
export const None: Story = {
  args: { total: 0, noun: 'note' },
  play: async ({ canvas, step }) => {
    await step('zero takes the plural, and the badge is still drawn', async () => {
      await expect(canvas.getByText('0 notes')).toBeVisible()
    })
  },
}

/** Narrowed says what of what, and keeps the noun. */
export const Narrowed: Story = {
  args: { shown: 3, total: 12, noun: 'report' },
  play: async ({ canvas, step }) => {
    await step('the whole is kept beside the part', async () => {
      // The noun follows the total, so `3 of 12 reports` says what the twelve
      // are. A count of three alone cannot be told from a section that holds
      // three.
      await expect(canvas.getByText('3 of 12 reports')).toBeVisible()
    })
  },
}

/** The plural is declared where `${noun}s` is wrong. */
export const AnIrregularPlural: Story = {
  args: { shown: 3, total: 40, noun: 'entry', plural: 'entries' },
  play: async ({ canvas, step }) => {
    await step('the declared plural is used rather than the derived one', async () => {
      await expect(canvas.getByText('3 of 40 entries')).toBeVisible()
    })
  },
}

/** Both halves in the frame they are drawn in. */
export const OnASection: Story = {
  render: () => (
    <Section
      title="Actions"
      meta={<CountBadge shown={3} total={12} noun="task" />}
      actions={<AddAction label="Add task" />}
    >
      <p className="text-sm text-ink-muted">The table sits here.</p>
    </Section>
  ),
}

/**
 * Two doors, and one filled primary.
 *
 * Timeline offers an event and an activity side by side; two solid buttons
 * differing only in hue read as a segmented control, so the first takes the
 * outline.
 */
export const TwoDoors: Story = {
  render: () => (
    <Section
      title="Timeline"
      meta={<CountBadge total={40} noun="entry" plural="entries" />}
      actions={
        <div className="flex items-center gap-2">
          <AddAction label="New event" variant="outline" />
          <AddAction label="New activity" />
        </div>
      }
    >
      <p className="text-sm text-ink-muted">The entries sit here.</p>
    </Section>
  ),
}
