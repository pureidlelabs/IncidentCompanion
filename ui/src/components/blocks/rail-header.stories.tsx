import type { Meta, StoryObj } from '@storybook/react-vite'
import { FlaskConical, ShieldAlert } from 'lucide-react'
import { expect, within } from 'storybook/test'

import { Mark } from '@/components/ui/mark'

import { RailHeader } from '@/components/blocks/rail-header'
import { caseSwitcherRows } from '@/fixtures/railMenus'
import { Sidebar, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar'

/**
 * `RailHeader` at the head of a rail, folded and unfolded.
 */
const meta = {
  title: 'Blocks/App shell/Rail/Header',
  component: RailHeader,
  parameters: { layout: 'padded' },
  args: { name: 'INC-2026-0447', children: caseSwitcherRows },
  argTypes: {
    // Named rather than passed: an icon arg is a component, and Storybook
    // serialises it -- the docs page rendered lucide's own minified factory
    // where a name belonged.
    icon: {
      options: ['ShieldAlert', 'FlaskConical', 'none'],
      mapping: { ShieldAlert, FlaskConical, none: undefined },
      control: { type: 'select' },
    },
    mark: { control: false },
    children: { control: false },
  },
  decorators: [
    (Story, context) => (
      <SidebarProvider defaultOpen={context.parameters.railOpen !== false}>
        <Sidebar aria-label="Case">
          <SidebarHeader>
            <Story />
          </SidebarHeader>
        </Sidebar>
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof RailHeader>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Open, where the row is a two-line label and the whole of it is the control
 * that switches case.
 */
export const Unfolded: Story = {
  name: 'Unfolded \u2014 press it to switch',
  play: async ({ canvas, args }) => {
    // The name and the verb, because a row that only says the case name reads
    // as a label rather than as the control that changes which case is open.
    const trigger = canvas.getByRole('button', { name: `${args.name}. Switch` })
    await expect(trigger).toHaveTextContent(args.name)
    await expect(trigger).toHaveTextContent('Ransomware')
  },
  args: {
    icon: ShieldAlert,
    name: 'INC-2026-0447',
    caption: 'Ransomware \u2014 active',
    children: caseSwitcherRows,
  },
}

/**
 * A name with nothing under it, which is what a case with no state to report
 * draws: one line rather than a line and a gap.
 */
export const NoCaption: Story = {
  name: 'A name alone',
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('button', { name: new RegExp(args.name) })).toBeVisible()
  },
  args: { icon: ShieldAlert, name: 'INC-2026-0447', children: caseSwitcherRows },
}

/**
 * A case named at length, beside a status chip, against the rail's fixed
 * width.
 */
export const LongName: Story = {
  name: 'A name too long for the rail',
  play: async ({ canvas, args }) => {
    const trigger = canvas.getByRole('button', { name: new RegExp(args.name.slice(0, 20)) })
    const line = within(trigger).getByText(args.name)

    // Clipped to one line. Read as the property that clips: the row's own
    // width is the rail's either way, so a wrapped name simply makes it
    // taller rather than wider.
    const style = getComputedStyle(line)
    await expect(style.textOverflow).toBe('ellipsis')
    await expect(style.whiteSpace).toBe('nowrap')
    await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
  },
  args: {
    icon: FlaskConical,
    name: 'Suspected credential stuffing against the VPN gateway',
    status: 'open',
    caption: 'Investigation \u2014 open',
    children: caseSwitcherRows,
  },
}

/**
 * Folded to the glyph, where the name has nowhere to go and a tooltip carries
 * it instead.
 */
export const Folded: Story = {
  name: 'Folded \u2014 the glyph, and a tooltip',
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('button', { name: new RegExp(args.name) })).toBeInTheDocument()
  },
  parameters: { railOpen: false },
  args: {
    icon: ShieldAlert,
    name: 'INC-2026-0447',
    caption: 'Ransomware \u2014 active',
    children: caseSwitcherRows,
  },
}

/**
 * The product mark, which is what the app draws rather than a lucide glyph.
 */
export const WithTheProductMark: Story = {
  name: 'The product mark, not a glyph',
  args: {
    mark: <Mark tone="inherit" className="size-5" />,
    name: 'IncidentCompanion',
    caption: 'This install',
    children: caseSwitcherRows,
  },
}
