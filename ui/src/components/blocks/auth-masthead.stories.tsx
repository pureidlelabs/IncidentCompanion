import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Mark } from '@/components/ui/mark'

import { AuthMasthead } from './auth-masthead'

/**
 * What names the screen above an unauthenticated form.
 *
 * The group centres and the form under it does not, because a label centred
 * over its own control is unreadable.
 */
const meta = {
  title: 'Blocks/Auth/Masthead',
  component: AuthMasthead,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AuthMasthead>

export default meta
type Story = StoryObj<typeof meta>

/** All three lines: glyph, name, and the one line under it. */
export const Full: Story = {
  name: 'Glyph, name and lede',
  args: {
    title: 'Sign in to IncidentCompanion',
    lede: 'Welcome back.',
    mark: <Mark className="size-12" />,
  },
  play: async ({ canvas }) => {
    // The name is the screen's heading, not a line of text that looks like
    // one: it is what a screen reader announces on arrival.
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Sign in to IncidentCompanion' }),
    ).toBeVisible()
    await expect(canvas.getByText('Welcome back.')).toBeVisible()
  },
}

/** The name alone, which is what a screen with nothing to add passes. */
export const NameOnly: Story = {
  name: 'The name alone',
  args: { title: 'Choose a password' },
  play: async ({ canvas }) => {
    // No lede and no glyph: what a screen with nothing to add passes, and it
    // draws neither an empty line nor a gap where the mark would be.
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Choose a password',
    )
    await expect(canvas.queryByRole('img')).toBeNull()
  },
}

/**
 * A title long enough to wrap.
 *
 * The setup screen's is the longest here, and the glyph must stay centred over
 * a two-line name rather than over the first line.
 */
export const Wrapping: Story = {
  name: 'A name that wraps',
  args: {
    title: 'Set up IncidentCompanion on this install',
    lede: 'Nobody has claimed this install yet.',
    mark: <Mark className="size-12" />,
  },
  play: async ({ canvas, canvasElement }) => {
    // The glyph stays centred over the whole name rather than over its first
    // line, which is what wrapping a centred group is for. Neither suite
    // could see it: a jsdom box is zero on every side.
    const title = canvas.getByRole('heading', { level: 1 }).getBoundingClientRect()
    const mark = canvasElement.querySelector('svg')!.getBoundingClientRect()
    const middle = (box: DOMRect) => box.left + box.width / 2
    await expect(Math.abs(middle(mark) - middle(title))).toBeLessThan(2)
  },
}
