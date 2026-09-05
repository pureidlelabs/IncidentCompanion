import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { RailUser } from '@/components/blocks/rail-user'
import { sessionRows } from '@/fixtures/railMenus'
import { Sidebar, SidebarFooter, SidebarProvider } from '@/components/ui/sidebar'

/**
 * `RailUser` at the foot of a rail, folded and unfolded.
 */
const meta = {
  title: 'Blocks/App shell/Rail/User',
  component: RailUser,
  parameters: { layout: 'padded' },
  args: { person: { name: 'analyst@example.test', you: true }, children: sessionRows },
  decorators: [
    (Story, context) => (
      <SidebarProvider defaultOpen={context.parameters.railOpen !== false}>
        <Sidebar aria-label="Case">
          <SidebarFooter className="mt-0">
            <Story />
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof RailUser>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Open, where the whole row is the control that opens the session menu.
 */
export const Unfolded: Story = {
  name: 'Unfolded \u2014 press it for the session menu',
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole('button', { name: new RegExp(args.person.name) })
    await expect(trigger).toHaveTextContent(args.person.name)
  },
  args: {
    person: { name: 'analyst@example.test', you: true },
    caption: 'Signed in on this install',
    children: sessionRows,
  },
}

/** A name with nothing under it, which is one line rather than a line and a gap. */
export const NoCaption: Story = {
  name: 'A name alone',
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('button', { name: new RegExp(args.person.name) })).toBeVisible()
  },
}

/**
 * An address longer than the rail is wide.
 */
export const LongName: Story = {
  name: 'An address too long for the rail',
  play: async ({ canvas, canvasElement, args }) => {
    const rail = canvasElement.querySelector('[data-slot="sidebar"]')
      ?? canvasElement.firstElementChild!
    const trigger = canvas.getByRole('button', { name: new RegExp(args.person.name.slice(0, 20)) })
    await expect(trigger.getBoundingClientRect().right).toBeLessThanOrEqual(
      rail.getBoundingClientRect().right + 1,
    )
  },
  args: {
    person: { name: 'a.very.long.analyst.address@northwind-freight.example', you: true },
    caption: 'Signed in on this install',
    children: sessionRows,
  },
}

/**
 * Folded to the disc, where the address has nowhere to go and the row still
 * names itself for a screen reader.
 */
export const Folded: Story = {
  name: 'Folded \u2014 the disc, and a tooltip',
  play: async ({ canvas, args }) => {
    await expect(
      canvas.getByRole('button', { name: new RegExp(args.person.name) }),
    ).toBeInTheDocument()
  },
  parameters: { railOpen: false },
  args: {
    person: { name: 'analyst@example.test', you: true },
    caption: 'Signed in on this install',
    children: sessionRows,
  },
}
