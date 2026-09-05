import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { Link } from './link'

/**
 * A text link: it navigates through `href`, or answers `onPress` and is still a
 * link to assistive technology.
 */
const meta = {
  title: 'Components/Link',
  component: Link,
  parameters: { layout: 'centered' },
  args: { children: 'Open the case', href: '#case', onPress: fn() },
  render: (args) => <Link {...args} />,
} satisfies Meta<typeof Link>

export default meta
type Story = StoryObj<typeof meta>

/** The default: an `href`, standing in a sentence. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Open the case' })).toHaveAttribute(
      'href',
      '#case',
    )
  },
}

/**
 * Every variant, side by side.
 */
export const Variants: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex items-center gap-4 text-sm">
      <Link {...args} standalone>
        Open the case
      </Link>
      <Link {...args} variant="muted" standalone>
        Back to cases
      </Link>
      <Link {...args} variant="destructive" standalone>
        Delete this case
      </Link>
      <Link {...args} variant="quiet" standalone>
        lateral movement
      </Link>
    </div>
  ),
  /**
   * Every link on this row stands on its own rather than inside a sentence, so
   * each owes the 24px target floor.
   */
  play: async ({ canvasElement }) => {
    const links = [...canvasElement.querySelectorAll('a[data-slot="link"]')]
    await expect(links).toHaveLength(4)
    for (const el of links) {
      await expect(
        el.getBoundingClientRect().height,
        `"${el.textContent}" is below the 24px target floor`,
      ).toBeGreaterThanOrEqual(24)
    }
  },
}

/** In a sentence, which is the only place a plain link belongs. */
export const InProse: Story = {
  render: ({ children: _children, ...args }) => (
    <p className="max-w-sm text-sm text-ink">
      The account was disabled at 04:12. See <Link {...args}>the sign-in log for that hour</Link>{' '}
      for the addresses it was reached from.
    </p>
  ),
  /**
   * The other half of the floor: a link inside a sentence keeps no padding of
   * its own.
   */
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('a[data-slot="link"]')!
    const style = getComputedStyle(el)
    await expect(style.display).toBe('inline')
    await expect([style.paddingTop, style.paddingBottom]).toEqual(['0px', '0px'])
  },
}

/**
 * `quiet`, which is a name that navigates rather than an offer of a route.
 */
export const Quiet: Story = {
  render: ({ children: _children, ...args }) => (
    <ul className="flex list-none flex-col gap-1 p-0 text-sm">
      {['social engineering', 'execution', 'command & control'].map((phase) => (
        <li key={phase}>
          <Link {...args} variant="quiet" standalone>
            {phase}
          </Link>
        </li>
      ))}
    </ul>
  ),
  /**
   * Both halves of the variant, because the pointer decides which one shows.
   */
  play: async ({ canvas, canvasElement, userEvent }) => {
    const first = canvas.getByRole('link', { name: 'social engineering' })
    await userEvent.hover(canvasElement)
    await expect(getComputedStyle(first).textDecorationLine).toBe('none')
    await userEvent.hover(first)
    await expect(getComputedStyle(first).textDecorationLine).toBe('underline')
  },
}

/**
 * **`isDisabled` drops the underline and stops the press.**
 */
export const Disabled: Story = {
  args: { isDisabled: true, children: 'Export the report' },
  render: (args) => (
    <div className="flex items-center gap-4 text-sm">
      <Link {...args} />
      <Link {...args} variant="muted">
        Back to cases
      </Link>
    </div>
  ),
  play: async ({ args, canvas, step, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'Export the report' })

    await step('Still a link, and announced as disabled', async () => {
      await expect(link).toHaveAttribute('aria-disabled', 'true')
    })

    // No click here: `userEvent` refuses to synthesise an interaction against
    // `pointer-events: none`, so it would report nothing rather than a press
    // that did not land. The guard itself is what gets asserted.
    await step('The pointer cannot reach it', async () => {
      await expect(getComputedStyle(link).pointerEvents).toBe('none')
      await expect(args.onPress).not.toHaveBeenCalled()
    })

    await step('And the keyboard does not activate it either', async () => {
      link.focus()
      await userEvent.keyboard('{Enter}')
      await expect(args.onPress).not.toHaveBeenCalled()
    })
  },
}

/**
 * **No `href`: it takes `onPress` and still announces as a link.**
 */
export const WithoutHref: Story = {
  args: { children: 'Show the raw event' },
  // `href` is dropped rather than set to `undefined`: under
  // `exactOptionalPropertyTypes` an explicit `undefined` is not the same as an
  // absent prop, and the story is about the prop being absent.
  render: ({ href: _href, ...args }) => <Link {...args} />,
  play: async ({ args, canvas, step, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'Show the raw event' })

    await step('It has no address', async () => {
      await expect(link).not.toHaveAttribute('href')
    })

    await step('And answers the press itself', async () => {
      await userEvent.click(link)
      await expect(args.onPress).toHaveBeenCalledTimes(1)
    })
  },
}

/**
 * The longest text a link is likely to carry, wrapping inside a measure.
 */
export const LongLabel: Story = {
  render: ({ children: _children, ...args }) => (
    <p className="max-w-xs text-sm text-ink">
      See{' '}
      <Link {...args}>
        the sign-in log for the finance tenant between 04:00 and 05:00 on 29 August
      </Link>{' '}
      for the addresses.
    </p>
  ),
}
