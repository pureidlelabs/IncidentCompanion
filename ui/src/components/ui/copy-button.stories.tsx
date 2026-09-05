import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, fn, userEvent, waitFor } from 'storybook/test'

import { CopyButton } from './copy-button'

const HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

/**
 * A button that copies a value to the clipboard and turns its glyph to a tick to
 * say so.
 */
const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  parameters: { layout: 'centered' },
  // The last two stories render a fixed set rather than one button, so this
  // satisfies the type and reaches nothing there.
  args: { value: HASH },
} satisfies Meta<typeof CopyButton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Lend the page a clipboard for the length of a demonstration.
 */
async function withClipboard(run: () => Promise<void>): Promise<void> {
  const held = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.resolve() },
  })
  try {
    await run()
  } finally {
    if (held === undefined) Reflect.deleteProperty(navigator, 'clipboard')
    else Object.defineProperty(navigator, 'clipboard', held)
  }
}

/**
 * Icon-only, which is what a value beside a field wants.
 */
export const Default: Story = {
  args: { value: HASH, onCopy: fn() },
  play: async ({ args, canvas, step }) => {
    const button = canvas.getByRole('button')
    const before = button.getBoundingClientRect()

    await withClipboard(async () => {
      await step('The press reaches the clipboard', async () => {
        await userEvent.click(button)
        await waitFor(() => {
          void expect(args.onCopy).toHaveBeenCalledWith(HASH)
        })
      })

      await step('And the button does not move while it says so', async () => {
        const after = button.getBoundingClientRect()
        await expect(after.width).toBeCloseTo(before.width, 0)
        await expect(after.height).toBeCloseTo(before.height, 0)
      })
    })
  },
}

/**
 * With a label. The glyph keeps its slot, so the width never moves.
 */
export const Labelled: Story = {
  args: { value: HASH, children: 'Copy hash', onCopy: fn() },
  play: async ({ args, canvas, step }) => {
    const button = canvas.getByRole('button')
    const before = button.getBoundingClientRect().width

    await withClipboard(async () => {
      await step('It copies', async () => {
        await userEvent.click(button)
        await waitFor(() => {
          void expect(args.onCopy).toHaveBeenCalled()
        })
      })

      await step('And is exactly as wide as it was', async () => {
        await expect(button.getBoundingClientRect().width).toBeCloseTo(before, 0)
        await expect(button).toHaveTextContent('Copy hash')
      })
    })
  },
}

/**
 * Beside the value it copies, which is the call site this exists for. The
 * copied state lasts `resetAfter` and then goes back on its own.
 */
export const BesideAValue: Story = {
  args: { value: HASH },
  render: (args) => (
    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      <code className="font-mono text-xs text-ink-muted">{HASH.slice(0, 24)}...</code>
      <CopyButton {...args} />
    </div>
  ),
  play: async ({ canvas, step }) => {
    const button = canvas.getByRole('button')
    const row = button.parentElement!.getBoundingClientRect()

    await step('The button sits inside the row it belongs to', async () => {
      const box = button.getBoundingClientRect()
      await expect(box.right).toBeLessThanOrEqual(row.right + 1)
      await expect(box.height).toBeLessThanOrEqual(row.height)
    })

    await step('And the row does not grow when it is pressed', async () => {
      await withClipboard(async () => {
        await userEvent.click(button)
      })
      await expect(button.parentElement!.getBoundingClientRect().height).toBeCloseTo(
        row.height,
        0,
      )
    })
  },
}

/**
 * `resetAfter` holds the tick longer, for a value the analyst pastes into
 * another window before looking back.
 */
export const HeldLonger: Story = {
  args: { value: HASH, resetAfter: 5000, children: 'Copy, held 5s', onCopy: fn() },
  play: async ({ args, canvas }) => {
    // The holding itself is a wait this tier should not spend; what is settled
    // is that the longer setting still copies and still keeps its box.
    const button = canvas.getByRole('button')
    const before = button.getBoundingClientRect().width

    await withClipboard(async () => {
      await userEvent.click(button)
      await waitFor(() => {
        void expect(args.onCopy).toHaveBeenCalled()
      })
      await expect(button.getBoundingClientRect().width).toBeCloseTo(before, 0)
    })
  },
}

/**
 * Every `Button` variant is still available, because this is a `Button` with a
 * glyph that changes rather than a control of its own.
 */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <CopyButton value={HASH} variant="ghost" />
      <CopyButton value={HASH} variant="outline">
        Outline
      </CopyButton>
      <CopyButton value={HASH} variant="secondary">
        Secondary
      </CopyButton>
    </div>
  ),
  play: async ({ canvas }) => {
    const grounds = canvas
      .getAllByRole('button')
      .map((button) => getComputedStyle(button).backgroundColor)

    await expect(new Set(grounds).size).toBe(3)
  },
}

/**
 * Refused and disabled read as they do on any button.
 */
export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <CopyButton value={HASH} isDisabled>
        Disabled
      </CopyButton>
      <CopyButton value={HASH} isRefused>
        Refused
      </CopyButton>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const [disabled, refused] = canvas.getAllByRole('button')

    await step('One cannot be pressed and the other can', async () => {
      await expect(disabled).toBeDisabled()
      await expect(refused).toBeEnabled()
    })

    await step('Both are dimmed, and the refused one says so with the cursor', async () => {
      await expect(getComputedStyle(disabled!).opacity).toBe(
        getComputedStyle(refused!).opacity,
      )
      await expect(getComputedStyle(refused!).cursor).toBe('not-allowed')
      await expect(getComputedStyle(disabled!).cursor).not.toBe('not-allowed')
    })
  },
}
