import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Spinner } from './spinner'

/**
 * A busy indicator, announced as `role="status"` with a default label of
 * `Loading`.
 *
 * Pass `aria-label` wherever the wait has a subject: the default says something
 * is happening and nothing about what, and an analyst hearing it cannot tell
 * which of several panes is still waiting. It replaces the default rather than
 * adding to it.
 *
 * It paints `currentColor`, so it takes the colour of whatever it sits in.
 * `pane` is the size for a whole region waiting; the rest are glyph sizes.
 *
 * **It stops for an analyst who asked for less motion.** A spinner that carries
 * the whole of a busy state cannot be guarded, so it does not carry the whole
 * of one: a caller pairs it with words -- `Button` shows *Deleting...* beside
 * it -- and the words go on saying what is happening when the spinning stops.
 */
const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  parameters: { layout: 'centered' },
  args: { size: 'default' },
  render: (args) => <Spinner {...args} />,
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default size, at the size a control's glyph takes.
 *
 * It announces itself without being told to: `role="status"` and a label of
 * `Loading`, so a screen reader says something is happening even where the
 * caller passed nothing.
 */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveAccessibleName('Loading')
  },
}

/** The size ladder. `pane` is the `--control-h-lg` tier, for a spinner standing alone. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner size="xs" aria-label="Loading, extra small" />
      <Spinner size="sm" aria-label="Loading, small" />
      <Spinner size="default" aria-label="Loading, default" />
      <Spinner size="lg" aria-label="Loading, large" />
      <Spinner size="pane" aria-label="Loading the pane" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // The ladder ascends. A size that stopped resolving renders at the default
    // and the row still looks deliberate, so the order is what has to be
    // asserted rather than any one value.
    const widths = [...canvasElement.querySelectorAll('[data-slot="spinner"]')].map(
      (el) => el.getBoundingClientRect().width,
    )
    await expect(widths).toHaveLength(5)
    for (let index = 1; index < widths.length; index += 1) {
      await expect(widths[index]!).toBeGreaterThan(widths[index - 1]!)
    }
  },
}

/** It paints in `currentColor`, so a text colour retints it. */
export const Tinted: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Spinner className="text-ink-muted" aria-label="Loading, muted" />
      <Spinner className="text-primary" aria-label="Loading, primary" />
      <Spinner className="text-destructive" aria-label="Loading, destructive" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const colours = [...canvasElement.querySelectorAll('[data-slot="spinner"]')].map(
      (el) => getComputedStyle(el).color,
    )
    // Three different colours, not three copies of the default: `text-current`
    // in the base is what lets the caller's class through, and a base that
    // painted its own colour would silently win and look fine.
    await expect(new Set(colours).size).toBe(3)
  },
}

/**
 * **`aria-label` replaces the default rather than adding to it.**
 *
 * `Loading` is enough to say something is happening and nothing about what. A
 * caller that knows should say - `Loading the timeline` - because an analyst
 * hearing it has no other way to tell which of several panes is still waiting.
 *
 * The override works because `{...props}` is spread **after** the default in
 * `spinner.tsx`. Reordering those two lines is a plausible tidy-up that would
 * pin every spinner in the application to `Loading` and change nothing visible,
 * which is what the `play` here exists to catch.
 */
export const LabelledByTheCaller: Story = {
  args: { 'aria-label': 'Loading the timeline' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveAccessibleName('Loading the timeline')
    await expect(canvas.queryByLabelText('Loading')).not.toBeInTheDocument()
  },
}

/** Beside a label, which is what a busy pane usually shows. */
export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <Spinner size="sm" aria-label="Loading the timeline" />
      <span>Loading the timeline</span>
    </div>
  ),
}
