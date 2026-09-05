import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Boxes, FileText, Gauge, ShieldAlert, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { RailGroup, RailRow } from '@/components/blocks/rail-nav'
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@/components/ui/sidebar'

const CASE_ID = 'DEMO-CAMPAIGN'
const CURRENT = `/cases/${CASE_ID}/timeline`

/**
 * A fold key per story, seeded before the first render.
 */
const OPEN_GROUP = 'story:rail-nav:open'
const FOLDED_GROUP = 'story:rail-nav:folded'

try {
  window.localStorage.setItem(OPEN_GROUP, 'true')
  window.localStorage.setItem(FOLDED_GROUP, 'false')
} catch {
  // A refused store leaves both groups on their default, which is unfolded.
}

const SECTIONS = [
  { label: 'Overview', icon: Gauge, to: `/cases/${CASE_ID}/overview` },
  { label: 'Timeline', icon: FileText, to: CURRENT, count: 42 },
  { label: 'Systems', icon: Boxes, to: `/cases/${CASE_ID}/systems`, count: 14 },
  // Counted, and holding nothing: the guard is `> 0`, so a section with an
  // explicit zero is the only thing that tells it from a bare `!== undefined`.
  { label: 'Accounts', icon: Users, to: `/cases/${CASE_ID}/accounts`, count: 0 },
  { label: 'Indicators', icon: ShieldAlert, to: `/cases/${CASE_ID}/indicators`, count: 3 },
]

function Rows() {
  return (
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
            : { countLabel: `${String(section.count)} rows` })}
        />
      ))}
    </SidebarMenu>
  )
}

function Shell({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[CURRENT]}>
      <SidebarProvider open={open} className="h-[32rem]">
        <Sidebar aria-label="Case sections">
          <SidebarContent>{children}</SidebarContent>
        </Sidebar>
        <SidebarInset className="p-6">
          <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-ink-muted">
            The screen beside the rail
          </div>
        </SidebarInset>
      </SidebarProvider>
    </MemoryRouter>
  )
}

/**
 * The rail's rows and groups, on the router the real shell gives them.
 */
const meta = {
  title: 'Blocks/App shell/Rail/Nav',
  component: RailRow,
  parameters: { layout: 'fullscreen' },
  args: { label: 'Overview' },
} satisfies Meta<typeof RailRow>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Open, where each row is a glyph, a label and the count the section holds.
 */
export const Unfolded: Story = {
  name: 'Rows unfolded \u2014 the current row, and two counts',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const section of SECTIONS) {
      await expect(canvas.getByText(section.label)).toBeVisible()
    }
    // A count is drawn only where there is something to count. Accounts is
    // served a zero and draws none: a rail is scanned for what has anything in
    // it, and a column of zeroes is what that scan has to read past.
    for (const one of SECTIONS.filter((s) => (s.count ?? 0) > 0)) {
      await expect(canvas.getByText(String(one.count))).toBeVisible()
    }
    await expect(canvas.queryByText('0')).not.toBeInTheDocument()
  },
  render: () => (
    <Shell open>
      <Rows />
    </Shell>
  ),
}

/**
 * Folded, where the labels go and the rows stay reachable.
 */
export const Folded: Story = {
  name: 'Rows folded \u2014 glyphs and tooltips',
  render: () => (
    <Shell open={false}>
      <Rows />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Timeline')).toBeNull()
    await expect(canvas.getAllByRole('link')).toHaveLength(SECTIONS.length)
  },
}

/**
 * A group open, with its own rows under it.
 */
export const GroupUnfolded: Story = {
  name: 'A group unfolded',
  render: () => (
    <Shell open>
      <RailGroup
        label="Investigation"
        storageKey={OPEN_GROUP}
        holdsCurrent={false}
        testId="rail-group-investigation"
      >
        <Rows />
      </RailGroup>
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Investigation')).toBeTruthy()
    await expect(canvas.getByText('Timeline')).toBeTruthy()
  },
}

/**
 * The same group shut: the heading stays and its rows are gone.
 */
export const GroupFolded: Story = {
  name: 'A group folded \u2014 the heading alone',
  render: () => (
    <Shell open>
      <RailGroup
        label="Reports"
        storageKey={FOLDED_GROUP}
        holdsCurrent={false}
        testId="rail-group-reports"
      >
        <Rows />
      </RailGroup>
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Reports')).toBeTruthy()
    await expect(canvas.queryByText('Timeline')).toBeNull()
  },
}

/**
 * A row that acts rather than navigates, and is marked current by the caller.
 */
export const ActionRow: Story = {
  name: 'A row that acts, marked active by the caller',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Buttons rather than links: there is nowhere to go.
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
    // One edge, on the row the caller called current -- there is no route to
    // compare against, so nothing else could have decided it.
    await expect(canvas.getAllByTestId('rail-active-edge')).toHaveLength(1)
  },
  render: () => (
    <Shell open>
      <SidebarMenu>
        <RailRow
          icon={Gauge}
          label="Draft report"
          qualifier="draft"
          active
          onSelect={() => undefined}
        />
        <RailRow icon={FileText} label="Signed report" onSelect={() => undefined} />
      </SidebarMenu>
    </Shell>
  ),
}

/**
 * A row with a list nested under it, which is what `bare` exists for.
 */
export const NestedList: Story = {
  name: 'A row with a list under it',
  render: () => (
    <Shell open>
      <SidebarMenu>
        <SidebarMenuItem>
          <RailRow bare icon={FileText} label="Report" onSelect={() => undefined} count={2} />
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <RailRow bare level="sub" label="Customer account" onSelect={() => undefined} />
            </SidebarMenuSubItem>
            <SidebarMenuSubItem>
              <RailRow
                bare
                level="sub"
                label="Regulator filing"
                qualifier="Sent"
                onSelect={() => undefined}
              />
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </SidebarMenuItem>
      </SidebarMenu>
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Customer account')).toBeVisible()
    // The row the caller owns draws no item of its own, so the nested list is
    // the only `ul` under the parent item.
    const items = canvasElement.querySelectorAll('[data-slot="sidebar-menu-item"]')
    await expect(items).toHaveLength(1)
  },
}

/**
 * A link the caller marks current, on a route the router does not match.
 */
export const ActiveWinsOverTheRoute: Story = {
  name: 'The caller marks a link current, not the router',
  render: () => (
    <Shell open>
      <SidebarMenu>
        {/* Not the current route, and marked current anyway. */}
        <RailRow icon={FileText} label="Customer RCA" to={`/cases/${CASE_ID}/reports?r=1`} active />
        {/* The current route, and not marked. */}
        <RailRow icon={FileText} label="Timeline" to={CURRENT} active={false} />
      </SidebarMenu>
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const edges = canvas.getAllByTestId('rail-active-edge')
    await expect(edges).toHaveLength(1)

    // On the row the caller named, not the one the router matched.
    const marked = canvas.getByRole('link', { name: /Customer RCA/ })
    await expect(marked.contains(edges[0]!)).toBe(true)
  },
}
