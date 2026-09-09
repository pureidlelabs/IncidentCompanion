import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Boxes,
  FileText,
  Fingerprint,
  Gauge,
  Plus,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { expect, userEvent, waitFor } from 'storybook/test'

import { Menu, MenuItem, MenuSectionGroup, MenuTrigger } from '@/components/ui/menu'
import {
  Rail,
  RailBody,
  RailCount,
  RailHead,
  RailItem,
  RailList,
  RailPage,
  RailRow,
  RailSection,
  RailSectionHeading,
  RailShell,
  RailSubItem,
  RailSubList,
  RailSwitcher,
  RailToggle,
  useRail,
} from '@/components/ui/rail'

const SECTIONS = [
  { label: 'Overview', icon: Gauge, count: undefined },
  { label: 'Timeline', icon: FileText, count: 42 },
  { label: 'Systems', icon: Boxes, count: 14 },
  { label: 'Accounts', icon: Users, count: 7 },
  { label: 'Indicators', icon: Fingerprint, count: 3 },
]

function CaseSwitcher() {
  return (
    <MenuTrigger>
      <RailSwitcher
        mark={<ShieldAlert aria-hidden className="size-4" />}
        label="INC-2026-0447"
        caption={'Ransomware \u2014 active'}
        tooltip="INC-2026-0447"
      />
      <Menu onAction={() => undefined}>
        <MenuSectionGroup title="Recent cases">
          <MenuItem id="0447">INC-2026-0447</MenuItem>
          <MenuItem id="0431">INC-2026-0431</MenuItem>
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

function Head() {
  const { folded } = useRail()
  return (
    <RailHead>
      {folded ? (
        <div className="flex flex-col items-center gap-1">
          <CaseSwitcher />
          <RailToggle />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <CaseSwitcher />
          </div>
          <RailToggle />
        </div>
      )}
    </RailHead>
  )
}

function Rows() {
  return (
    <Rail aria-label="Case sections">
      <Head />
      <RailBody aria-label="Case sections">
        <RailSection>
          <RailSectionHeading>Investigation</RailSectionHeading>
          <RailList>
            {SECTIONS.map((section, at) => (
              <RailItem key={section.label}>
                <RailRow isActive={at === 1} tooltip={section.label} href="#">
                  <section.icon aria-hidden />
                  <span className="truncate">{section.label}</span>
                  {section.count !== undefined && <RailCount>{section.count}</RailCount>}
                </RailRow>
                {at === 1 && (
                  <RailSubList>
                    <RailSubItem>
                      <RailRow tooltip="Kill chain" href="#">
                        <span className="truncate">Kill chain</span>
                      </RailRow>
                    </RailSubItem>
                  </RailSubList>
                )}
              </RailItem>
            ))}
          </RailList>
        </RailSection>
      </RailBody>
    </Rail>
  )
}

function Page() {
  return (
    <RailPage className="p-6">
      <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-ink-muted">
        The screen beside the rail
      </div>
    </RailPage>
  )
}

/** The rail: the column of destinations beside every screen, folding to a strip of glyphs. */
const meta = {
  title: 'Components/Rail',
  component: RailShell,
  parameters: { layout: 'fullscreen' },
  args: { children: null },
} satisfies Meta<typeof RailShell>

export default meta
type Story = StoryObj<typeof meta>

/** Wide, with every label, count and sub-list drawn, and the shortcut that folds it. */
export const Unfolded: Story = {
  render: () => (
    <RailShell className="h-[32rem]">
      <Rows />
      <Page />
    </RailShell>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const rail = canvasElement.querySelector<HTMLElement>('[data-part="rail"]')!

    await step('The rail is unfolded, and wide enough to read', async () => {
      await expect(rail).not.toHaveAttribute('data-folded')
      await expect(rail.getBoundingClientRect().width).toBeGreaterThan(160)
    })

    await step('Labels, counts and the sub-list are all there', async () => {
      await expect(canvas.getByText('Indicators')).toBeVisible()
      await expect(canvas.getByText('42')).toBeVisible()
      await expect(canvas.getByText('Kill chain')).toBeVisible()
    })

    await step('And the keyboard folds it', async () => {
      await userEvent.keyboard('{Meta>}b{/Meta}')
      await waitFor(() => {
        void expect(rail).toHaveAttribute('data-folded')
      })
    })
  },
}

/** A strip of glyphs: labels at zero width, counts and sub-lists not drawn, a tooltip per row. */
export const Folded: Story = {
  name: 'Folded \u2014 glyphs and tooltips',
  render: () => (
    <RailShell defaultFolded className="h-[32rem]">
      <Rows />
      <Page />
    </RailShell>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const rail = canvasElement.querySelector<HTMLElement>('[data-part="rail"]')!

    await step('The rail is folded, and narrow', async () => {
      await expect(rail).toHaveAttribute('data-folded')
      await expect(rail.getBoundingClientRect().width).toBeLessThan(100)
    })

    // A label stays in the document at zero width; a count and a sub-list are
    // not drawn at all. `toBeVisible` cannot tell the first from a clipped
    // label, so the reading is the box.
    await step('The labels take no width, and the rest is not drawn', async () => {
      await expect(canvas.getByText('Indicators').getBoundingClientRect().width).toBe(0)
      await expect(canvas.queryByText('42')).not.toBeInTheDocument()
      await expect(canvas.queryByText('Kill chain')).not.toBeInTheDocument()
    })

    // Folded, the glyph is the row's whole identity, so two rows sharing one
    // are two rows an analyst cannot tell apart.
    await step('And no two glyphs are the same', async () => {
      const marks = [...rail.querySelectorAll('[data-part="rail-row"] svg')].map((svg) =>
        svg.getAttribute('class'),
      )
      await expect(marks.length).toBeGreaterThan(4)
      await expect(new Set(marks).size).toBe(marks.length)
    })
  },
}
