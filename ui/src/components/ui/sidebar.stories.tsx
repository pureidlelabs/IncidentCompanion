import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  BookOpen,
  Boxes,
  CircleUser,
  FileText,
  Fingerprint,
  Gauge,
  Plus,
  Server,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react'

import { expect, userEvent, waitFor } from 'storybook/test'

import { Menu, MenuItem, MenuSectionGroup, MenuTrigger } from '@/components/ui/menu'
import {
  Sidebar,
  SidebarCollapsibleGroup,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupPanel,
  SidebarGroupTrigger,
  SidebarHeader,
  SidebarHeaderMenuButton,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

const CASE_SECTIONS = [
  { label: 'Overview', icon: Gauge, count: undefined },
  { label: 'Timeline', icon: FileText, count: 42 },
  { label: 'Systems', icon: Boxes, count: 14 },
  { label: 'Accounts', icon: Users, count: 7 },
  { label: 'Indicators', icon: Fingerprint, count: 3 },
]

/**
 * **Glyphs no other row already uses.** Folded, the label goes and the glyph is
 * the whole of a row's identity, so any two rows sharing one are two rows an
 * analyst cannot tell apart -- in the story whose subject is exactly that.
 *
 * The `Folded` demonstration holds it now across every row in the rail, which is
 * what found the last three: the case mark against Indicators, and the footer's
 * account against Accounts. Chevrons are exempt, being chrome on a group header
 * rather than the identity of a row.
 */
const REFERENCE = [
  { label: 'Playbooks', icon: BookOpen },
  { label: 'Assets', icon: Server },
]

/** The case switcher: the header row, and the menu it opens. */
function CaseSwitcher() {
  return (
    <MenuTrigger>
      <SidebarHeaderMenuButton
        mark={<ShieldAlert aria-hidden className="size-4" />}
        label="INC-2026-0447"
        caption={'Ransomware \u2014 active'}
        tooltip="INC-2026-0447"
      />
      <Menu onAction={() => undefined}>
        <MenuSectionGroup title="Recent cases">
          <MenuItem id="0447">INC-2026-0447</MenuItem>
          <MenuItem id="0431">INC-2026-0431</MenuItem>
          <MenuItem id="0409">INC-2026-0409</MenuItem>
        </MenuSectionGroup>
        <MenuSectionGroup>
          <MenuItem id="new">
            <Plus aria-hidden />
            Open a case
          </MenuItem>
          <MenuItem id="settings">
            <Settings aria-hidden />
            Case settings
          </MenuItem>
        </MenuSectionGroup>
      </Menu>
    </MenuTrigger>
  )
}

/** The switcher and the fold control: side by side unfolded, stacked folded. */
function RailHead() {
  const { open } = useSidebar()
  return (
    <SidebarHeader>
      {open ? (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <CaseSwitcher />
          </div>
          <SidebarTrigger />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <CaseSwitcher />
          <SidebarTrigger />
        </div>
      )}
    </SidebarHeader>
  )
}

function Rail() {
  return (
    <Sidebar aria-label="Case sections">
      {/* No `SidebarSeparator` here: `SidebarHeader` already draws its own
          `border-b`, and the two rules landed 8px apart as a double line.
          The separator is for dividing runs *inside* the content. */}
      <RailHead />
      <SidebarContent>
        <SidebarCollapsibleGroup defaultExpanded>
          <SidebarGroupTrigger>Investigation</SidebarGroupTrigger>
          <SidebarGroupPanel>
            <SidebarMenu>
              {CASE_SECTIONS.map((section, at) => (
                <SidebarMenuItem key={section.label}>
                  <SidebarMenuButton isActive={at === 1} tooltip={section.label}>
                    <section.icon aria-hidden />
                    <span className="truncate">{section.label}</span>
                    {section.count !== undefined && (
                      <SidebarMenuBadge>{section.count}</SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                  {at === 1 && (
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuButton size="sm">
                          <span className="truncate">Kill chain</span>
                        </SidebarMenuButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuButton size="sm">
                          <span className="truncate">Activity</span>
                        </SidebarMenuButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupPanel>
        </SidebarCollapsibleGroup>
        <SidebarCollapsibleGroup defaultExpanded={false}>
          <SidebarGroupTrigger>Reference</SidebarGroupTrigger>
          <SidebarGroupPanel>
            <SidebarMenu>
              {REFERENCE.map((entry) => (
                <SidebarMenuItem key={entry.label}>
                  <SidebarMenuButton tooltip={entry.label}>
                    <entry.icon aria-hidden />
                    <span className="truncate">{entry.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupPanel>
        </SidebarCollapsibleGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Signed in as analyst">
              <CircleUser aria-hidden />
              <span className="truncate">analyst@example.test</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function Body() {
  return (
    <SidebarInset className="p-6">
      <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-ink-muted">
        The screen beside the rail
      </div>
    </SidebarInset>
  )
}

/**
 * The rail, folded and unfolded.
 *
 * Meta/ctrl + `b` toggles it. Folded, the labels, badges and sub-lists go and
 * the glyphs centre; the tooltips carry the names.
 *
 * **Nothing below the provider takes a folded prop.** The state is held once and
 * every part reads it off `data-state` on the rail, so a caller adds a row
 * without deciding what it does when the rail folds -- and a row that forgot
 * would be the one label left standing in a 48px column.
 *
 * The whole of that is width and visibility, so a renderer that lays nothing out
 * draws the same rail in both states.
 */
const meta = {
  title: 'Components/Sidebar',
  component: SidebarProvider,
  parameters: { layout: 'fullscreen' },
  // Every story renders its own provider, so the required child is a placeholder.
  args: { children: null },
} satisfies Meta<typeof SidebarProvider>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Unfolded: the labels, the counts and the open sub-list are all readable, which
 * is the state an analyst works in.
 */
export const Expanded: Story = {
  name: 'Unfolded',
  render: () => (
    <SidebarProvider defaultOpen className="h-[32rem]">
      <Rail />
      <Body />
    </SidebarProvider>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const rail = canvasElement.querySelector<HTMLElement>('[data-slot="sidebar"]')!

    await step('The rail says it is unfolded, and is wide enough to read', async () => {
      await expect(rail).toHaveAttribute('data-state', 'expanded')
      await expect(rail.getBoundingClientRect().width).toBeGreaterThan(160)
    })

    await step('Labels, counts and the open sub-list are all there', async () => {
      await expect(canvas.getByText('Indicators')).toBeVisible()
      await expect(canvas.getByText('42')).toBeVisible()
      await expect(canvas.getByText('Kill chain')).toBeVisible()
    })

    await step('And the keyboard folds it', async () => {
      await userEvent.keyboard('{Meta>}b{/Meta}')
      await waitFor(() => {
        void expect(rail).toHaveAttribute('data-state', 'collapsed')
      })
    })
  },
}

/**
 * Folded: the glyph is the whole of a row's identity, and the tooltip carries
 * the name.
 *
 * **The labels and the rest go by different routes**, measured: a label stays in
 * the document at zero width, while a badge and a sub-list are not rendered at
 * all. Either way nothing is left truncated, which is what would read as a
 * fault rather than as a fold.
 *
 * The glyphs are load-bearing here, so no two rows share one.
 */
export const Collapsed: Story = {
  name: 'Folded \u2014 glyphs and tooltips',
  render: () => (
    <SidebarProvider defaultOpen={false} className="h-[32rem]">
      <Rail />
      <Body />
    </SidebarProvider>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const rail = canvasElement.querySelector<HTMLElement>('[data-slot="sidebar"]')!

    await step('The rail is folded, and narrow', async () => {
      await expect(rail).toHaveAttribute('data-state', 'collapsed')
      await expect(rail.getBoundingClientRect().width).toBeLessThan(100)
    })

    // Two mechanisms, measured. A label stays in the document at zero width;
    // a badge and a sub-list are not rendered at all. `toBeVisible` cannot tell
    // the first from a label that is merely clipped, so the reading is the box.
    await step('The labels take no width, and the rest is not drawn', async () => {
      await expect(canvas.getByText('Indicators').getBoundingClientRect().width).toBe(0)
      await expect(canvas.queryByText('42')).not.toBeInTheDocument()
      await expect(canvas.queryByText('Kill chain')).not.toBeInTheDocument()
    })

    // Folded, the glyph is the row's whole identity, so two rows sharing one
    // are two rows an analyst cannot tell apart.
    await step('And no two glyphs are the same', async () => {
      const marks = [...rail.querySelectorAll('[data-slot="sidebar-menu-button"] svg')].map(
        (svg) => svg.getAttribute('class'),
      )
      await expect(marks.length).toBeGreaterThan(4)
      await expect(new Set(marks).size).toBe(marks.length)
    })
  },
}

/**
 * The rail on the trailing edge, for a screen whose subject is the body and
 * whose navigation is secondary.
 *
 * `side` is the only thing that changes: the same parts, the same state, drawn
 * the other way round.
 */
export const RightHand: Story = {
  name: 'On the right edge',
  render: () => (
    <SidebarProvider defaultOpen className="h-[32rem]">
      <Sidebar side="right" aria-label="Case sections">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Investigation</SidebarGroupLabel>
            <SidebarMenu>
              {CASE_SECTIONS.map((section) => (
                <SidebarMenuItem key={section.label}>
                  <SidebarMenuButton tooltip={section.label}>
                    <section.icon aria-hidden />
                    <span className="truncate">{section.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <Body />
    </SidebarProvider>
  ),
  play: async ({ canvasElement, step }) => {
    const rail = canvasElement.querySelector<HTMLElement>('[data-slot="sidebar"]')!
    const body = canvasElement.querySelector<HTMLElement>('[data-slot="sidebar-inset"]')!

    await step('The rail is past the body rather than before it', async () => {
      await expect(rail.getBoundingClientRect().left).toBeGreaterThan(
        body.getBoundingClientRect().left,
      )
    })

    await step('And the two do not overlap', async () => {
      await expect(rail.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        body.getBoundingClientRect().right - 1,
      )
    })
  },
}
