import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Disclosure, DisclosureGroup, DisclosureHeader, DisclosurePanel } from './disclosure'

/**
 * **The tier that can see a state.** jsdom gives every element a zero box, so
 * expanded and collapsed are indistinguishable there. Each state gets a story,
 * and axe runs over every one.
 */
const meta = {
  title: 'Components/Disclosure',
  component: Disclosure,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Disclosure>

export default meta
type Story = StoryObj<typeof meta>

const scope =
  'Twelve mailboxes in the finance tenant, read in bulk through the Graph API between 02:14 and 04:40 UTC.'

/**
 * One section, closed. The panel is in the DOM and hidden, not unmounted.
 *
 * `hidden="until-found"` rather than removal, so the browser's own find-in-page
 * reaches the text and opens the section around it -- which is the difference
 * between a long report an analyst can search and one where the answer is in a
 * section they have to guess to open.
 */
export const Collapsed: Story = {
  render: () => (
    <Disclosure>
      <DisclosureHeader>Scope of the breach</DisclosureHeader>
      <DisclosurePanel>{scope}</DisclosurePanel>
    </Disclosure>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const panel = canvasElement.querySelector<HTMLElement>('[data-slot="disclosure-panel"]')!

    await step('The trigger says it is shut', async () => {
      await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    })

    await step('And the panel is hidden to the eye, not to find-in-page', async () => {
      await expect(panel).toHaveAttribute('hidden', 'until-found')
      await expect(panel.textContent).toContain('Twelve mailboxes')
    })
  },
}

/** The same section standing open, which is the chevron's other position. */
export const Expanded: Story = {
  render: () => (
    <Disclosure defaultExpanded>
      <DisclosureHeader>Scope of the breach</DisclosureHeader>
      <DisclosurePanel>{scope}</DisclosurePanel>
    </Disclosure>
  ),
  play: async ({ canvas, canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>('[data-slot="disclosure-panel"]')!

    await expect(canvas.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).not.toHaveAttribute('hidden')
    await expect(panel.getBoundingClientRect().height).toBeGreaterThan(0)
  },
}

/** The bordered variant, which is what a section standing alone on a pane wears. */
export const Bordered: Story = {
  render: () => (
    <Disclosure variant="bordered" defaultExpanded>
      <DisclosureHeader>Scope of the breach</DisclosureHeader>
      <DisclosurePanel>{scope}</DisclosurePanel>
    </Disclosure>
  ),
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector<HTMLElement>('[data-slot="disclosure"]')!

    await expect(
      Number.parseFloat(getComputedStyle(section).borderTopWidth),
    ).toBeGreaterThan(0)
  },
}

/**
 * Disabled, in both positions.
 *
 * **The trigger takes the native `disabled` attribute**, measured -- not
 * `aria-disabled`, and with no `tabindex`. So it cannot be focused and a reader
 * tabbing through the page never learns the section is there.
 *
 * **That is React Aria's behaviour and it is kept.** `isDisabled` means
 * unreachable there, and `isPending` is the state it offers for reachable and
 * refusing; a control whose absence carries information -- *there is no report
 * yet* -- should therefore not be disabled at all, but say so. Overriding the
 * foundation to make a disabled thing focusable is the workaround this kit does
 * not take.
 *
 * A section that was open when it was disabled stays open, so a disabled group
 * is one an analyst may read and not rearrange.
 */
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Disclosure isDisabled>
        <DisclosureHeader>Closed and disabled</DisclosureHeader>
        <DisclosurePanel>{scope}</DisclosurePanel>
      </Disclosure>
      <Disclosure variant="bordered" isDisabled defaultExpanded>
        <DisclosureHeader>Open and disabled</DisclosureHeader>
        <DisclosurePanel>{scope}</DisclosurePanel>
      </Disclosure>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const [shut, open] = canvas.getAllByRole('button')

    await step('Both refuse', async () => {
      await expect(shut).toBeDisabled()
      await expect(open).toBeDisabled()
    })

    // The native attribute is there, and the section is unreachable because
    // of it. Decided rather than merely observed: a change to `aria-disabled`
    // turns this red.
    await step('Through the native attribute, so neither takes focus', async () => {
      await expect(shut).toHaveAttribute('disabled')
      await expect(shut).not.toHaveAttribute('aria-disabled')
      shut!.focus()
      await expect(shut).not.toHaveFocus()
    })
  },
}

/**
 * A group, which is what an accordion is here. One section stands open at a
 * time; every child needs an `id` for `expandedKeys` to address it.
 */
export const Group: Story = {
  render: () => (
    <DisclosureGroup variant="bordered" defaultExpandedKeys={['scope']}>
      <Disclosure id="scope">
        <DisclosureHeader>Scope</DisclosureHeader>
        <DisclosurePanel>{scope}</DisclosurePanel>
      </Disclosure>
      <Disclosure id="containment">
        <DisclosureHeader>Containment</DisclosureHeader>
        <DisclosurePanel>
          Sessions revoked across the tenant, and conditional access tightened to compliant
          devices.
        </DisclosurePanel>
      </Disclosure>
      <Disclosure id="notification">
        <DisclosureHeader>Notification</DisclosureHeader>
        <DisclosurePanel>Supervisory authority notified within the 72-hour window.</DisclosurePanel>
      </Disclosure>
    </DisclosureGroup>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const openCount = () =>
      [...canvasElement.querySelectorAll('[data-slot="disclosure-panel"]')].filter(
        (panel) => !panel.hasAttribute('hidden'),
      ).length

    await step('One stands open', async () => {
      await expect(openCount()).toBe(1)
    })

    await step('And opening another shuts it, rather than adding to it', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Containment' }))
      await waitFor(() => {
        void expect(canvas.getByRole('button', { name: 'Containment' })).toHaveAttribute(
          'aria-expanded',
          'true',
        )
      })
      await expect(canvas.getByRole('button', { name: 'Scope' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })
  },
}

/** Several sections open at once, and one of them disabled inside the group. */
export const GroupMultiple: Story = {
  render: () => (
    <DisclosureGroup allowsMultipleExpanded defaultExpandedKeys={['scope', 'containment']}>
      <Disclosure id="scope">
        <DisclosureHeader>Scope</DisclosureHeader>
        <DisclosurePanel>{scope}</DisclosurePanel>
      </Disclosure>
      <Disclosure id="containment">
        <DisclosureHeader>Containment</DisclosureHeader>
        <DisclosurePanel>Sessions revoked across the tenant.</DisclosurePanel>
      </Disclosure>
      <Disclosure id="notification" isDisabled>
        <DisclosureHeader>Notification</DisclosureHeader>
        <DisclosurePanel>Nothing recorded yet.</DisclosurePanel>
      </Disclosure>
    </DisclosureGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('Two stand open together', async () => {
      for (const name of ['Scope', 'Containment']) {
        await expect(canvas.getByRole('button', { name })).toHaveAttribute(
          'aria-expanded',
          'true',
        )
      }
    })

    await step('And one section refuses inside a group that does not', async () => {
      await expect(canvas.getByRole('button', { name: 'Notification' })).toBeDisabled()
      await expect(canvas.getByRole('button', { name: 'Scope' })).toBeEnabled()
    })
  },
}

/** The whole group disabled, which every trigger inherits. */
export const GroupDisabled: Story = {
  render: () => (
    <DisclosureGroup variant="bordered" isDisabled defaultExpandedKeys={['scope']}>
      <Disclosure id="scope">
        <DisclosureHeader>Scope</DisclosureHeader>
        <DisclosurePanel>{scope}</DisclosurePanel>
      </Disclosure>
      <Disclosure id="containment">
        <DisclosureHeader>Containment</DisclosureHeader>
        <DisclosurePanel>Sessions revoked across the tenant.</DisclosurePanel>
      </Disclosure>
    </DisclosureGroup>
  ),
  play: async ({ canvas, step }) => {
    await step('Every trigger takes it from the group', async () => {
      for (const trigger of canvas.getAllByRole('button')) {
        await expect(trigger).toBeDisabled()
      }
    })

    // The section that was open when the group was disabled stays open: a
    // disabled group is one an analyst may read and not rearrange.
    await step('And what was open stays readable', async () => {
      await expect(canvas.getByRole('button', { name: 'Scope' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
    })
  },
}

/**
 * **The fold, and the property it must not cost.**
 *
 * The panel animates its height off `--disclosure-panel-height`, which React
 * Aria writes and React Aria reads back: it waits on the panel's own
 * `getAnimations()` before restoring `hidden="until-found"`, so the section is
 * still findable by the browser's own find-in-page for the whole of the
 * collapse.
 *
 * The play function is what holds that: it presses the trigger, asserts the
 * panel is *still* unhidden and *is* animating on the frame after the press,
 * and only then waits for `hidden="until-found"` to come back. An animation
 * that ran anywhere but on this element - Motion's frame loop, a child - leaves
 * `getAnimations()` empty, and the attribute lands one microtask after the
 * press with the fold never drawn.
 */
export const Fold: Story = {
  render: () => (
    <Disclosure variant="bordered" defaultExpanded>
      <DisclosureHeader>Scope of the breach</DisclosureHeader>
      <DisclosurePanel>{scope}</DisclosurePanel>
    </Disclosure>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Scope of the breach' })
    const panel = canvasElement.querySelector('[data-slot="disclosure-panel"]')
    if (!(panel instanceof HTMLElement)) throw new Error('no panel')

    await step('the height is what animates, not opacity or a transform', async () => {
      await expect(getComputedStyle(panel).transitionProperty).toBe('height')
    })

    await step('collapsing leaves the panel findable until the fold finishes', async () => {
      await userEvent.click(trigger)
      // The frame after the press: React Aria has set the height to 0px and
      // started the transition, and has not yet put `hidden` back.
      await expect(panel.getAttribute('hidden')).toBe(null)
      await expect(panel.getAnimations().length).toBeGreaterThan(0)
    })

    await step('and hides itself to find-in-page, not to the DOM, once it has', async () => {
      await waitFor(() => expect(panel.getAttribute('hidden')).toBe('until-found'))
      // Still mounted: `until-found` is what lets the browser reach the text
      // and expand the section around it.
      await expect(panel.textContent).toContain('Twelve mailboxes')
    })
  },
}
