import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Boxes, FileText, Gauge, ShieldAlert, Users } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'

import { Rail } from '@/components/blocks/rail'
import { RailGroup, RailRow } from '@/components/blocks/rail-nav'
import { SidebarMenu, SidebarProvider } from '@/components/ui/sidebar'
import { caseSwitcherRows, sessionRows } from '@/fixtures/railMenus'

/**
 * The whole rail: it draws its own head and foot from `head` and `user`, and
 * takes `RailGroup` and `RailRow` as its rows.
 */
const meta = {
  title: 'Blocks/App shell/Rail',
  component: Rail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={['/timeline']}>
        <SidebarProvider defaultOpen={context.parameters.railOpen !== false}>
          {/* A fixed height rather than `h-dvh`. The rail fills the viewport in
              the app, and in a docs frame that is a column of empty ground
              below the user band taller than everything above it. This is
              enough to show the head, the rows and the foot with the gap the
              foot is pushed down by. */}
          <div className="h-[520px]">
            <Story />
          </div>
        </SidebarProvider>
      </MemoryRouter>
    ),
  ],
  argTypes: {
    head: { control: false },
    user: { control: false },
    children: { control: false },
  },
} satisfies Meta<typeof Rail>

export default meta
type Story = StoryObj<typeof meta>

const SECTIONS = [
  { label: 'Overview', icon: Gauge, to: '/overview' },
  { label: 'Timeline', icon: FileText, to: '/timeline', count: 42 },
  { label: 'Systems', icon: Boxes, to: '/systems', count: 14 },
  { label: 'Accounts', icon: Users, to: '/accounts', count: 7 },
  { label: 'Indicators', icon: ShieldAlert, to: '/indicators', count: 3 },
]

const rows = (
  <RailGroup
    label="Investigation"
    storageKey="sb-rail-group"
    holdsCurrent
    testId="rail-investigation"
  >
    <SidebarMenu>
      {SECTIONS.map((section) => (
        <RailRow
          key={section.label}
          icon={section.icon}
          label={section.label}
          to={section.to}
          {...(section.count === undefined ? {} : { count: section.count })}
          {...(section.count === undefined
            ? {}
            : { countLabel: `${String(section.count)} in ${section.label}` })}
        />
      ))}
    </SidebarMenu>
  </RailGroup>
)

const head = {
  icon: ShieldAlert,
  name: 'INC-2026-0447',
  caption: 'Ransomware \u2014 active',
  status: 'Open',
  menu: caseSwitcherRows,
}

const user = {
  person: { name: 'analyst@example.test', you: true },
  caption: 'Signed in on this install',
  menu: sessionRows,
}

/**
 * The rail as a case screen draws it: the case at the head, its sections, and
 * the analyst at the foot.
 */
export const Unfolded: Story = {
  args: { testId: 'rail', label: 'Case sections', head, user, children: rows },
  play: async ({ canvas, canvasElement }) => {
    // Three bands on one ground: the case, its sections, the analyst. What
    // separates them is the border and the order rather than a colour.
    const rail = within(canvasElement.querySelector<HTMLElement>('[data-testid="rail"]')!)
    await expect(rail.getByText('INC-2026-0447')).toBeVisible()
    await expect(rail.getByText('analyst@example.test')).toBeVisible()
    await expect(canvas.getAllByRole('link')).toHaveLength(SECTIONS.length)

    // A count is a bare number on the screen, so the section it belongs to
    // travels in its label and nowhere else.
    await expect(rail.getByLabelText('42 in Timeline')).toBeInTheDocument()
  },
}

/** Folded, every part is a glyph and the tooltip carries the words. */
export const Folded: Story = {
  name: 'Folded \u2014 glyphs and tooltips',
  parameters: { railOpen: false },
  args: { ...Unfolded.args },
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-testid="rail"]')!

    // Every row is still there and none of them draws its label: folded, the
    // rail is glyphs.
    const rail = within(box)
    await expect(rail.getAllByRole('link')).toHaveLength(SECTIONS.length)
    await expect(rail.queryByText('Overview')).toBeNull()

    // The words are in the tooltip, which is the only place left to carry
    // them -- a folded rail with no tooltips is a column of unnamed glyphs.
    // The tooltip that carries the words is not asserted here. It answers a
    // real pointer or a real keyboard journey, and opens for neither
    // `userEvent.hover` nor a programmatic `focus()`; a story that waited for
    // it would fail on a surface that works. It is judged in `visual-check`.
  },
}

/**
 * No analyst at the foot, which is the picker's shape before sign-in and the
 * one state where the footer band must not be drawn at all - an empty band is
 * a strip of rail ground under the last row with nothing to explain it.
 */
export const NoFooter: Story = {
  name: 'No one at the foot',
  args: { testId: 'rail', label: 'Case sections', head, children: rows },
  play: async ({ canvasElement }) => {
    // Not drawn at all rather than drawn empty: an empty band is a strip of
    // rail ground under the last row with nothing to explain it.
    await expect(canvasElement.querySelector('[data-testid="rail-footer"]')).toBeNull()
  },
}
