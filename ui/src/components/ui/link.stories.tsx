import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { Link } from './link'

/**
 * A text link: it navigates through `href`, or answers `onPress` and is still a
 * link to assistive technology.
 *
 * `standalone` is the caller's call, and adds the padding that meets the 24px
 * target floor. WCAG 2.5.8 exempts a link inside a block of text, and padding
 * one sets a paragraph's rhythm from its links rather than its prose - the
 * component cannot tell which case it is in.
 *
 * `quiet` is for a column of names that happen to navigate. A control that
 * performs an action rather than moving the analyst is a `Button`.
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
 *
 * `default` offers a route. `muted` is a way back rather than a way on.
 * `destructive` is the one that cannot be undone. `quiet` is a name that
 * happens to navigate - see `Quiet`.
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
   *
   * **Only this tier can hold it.** jsdom gives every element a zero box, so a
   * unit test reading a height compares `0` with `0` and passes over any
   * padding at all -- or none.
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
   *
   * WCAG 2.5.8 exempts it, and padding one sets the line's rhythm from its
   * links rather than from its prose. This goes red on a blanket change --
   * `standalone` applied in `link.tsx` rather than by the caller who knows
   * which of the two it has.
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
 *
 * A column of these is the case's own content: body ink at rest, with the rule
 * arriving under the pointer. `default` down the same column paints it primary
 * and reads as the control the screen wants pressed.
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
  play: async ({ canvasElement }) => {
    for (const el of canvasElement.querySelectorAll('a[data-slot="link"]')) {
      await expect(getComputedStyle(el).textDecorationLine).toBe('none')
    }
  },
}

/**
 * **`isDisabled` drops the underline and stops the press.**
 *
 * A disabled link is still announced, so an analyst reading the screen learns
 * the route exists and is closed to them - which a link simply removed does not
 * say. The `play` presses it and asserts nothing happened, which the prose here
 * claimed and nothing checked.
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
 *
 * Reach for this where the destination is not an address - a route the client
 * resolves, a pane that opens beside the current one. It stays a link because
 * it still takes the analyst somewhere, and that is what the role is for.
 *
 * It is not a way to make a button look like a link. That is `Button` with
 * `variant="link"`.
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
 *
 * A wrapped link keeps one underline per line rather than one box, which is
 * what tells the analyst it is a single destination.
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
