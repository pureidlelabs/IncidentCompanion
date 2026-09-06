import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { LayoutGrid, PanelLeft, Square } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'

import { AppShell } from '@/components/blocks/app-shell'
import { RailGroup, RailRow } from '@/components/blocks/rail-nav'
import { Rail } from '@/components/blocks/rail'
import { sessionRows } from '@/fixtures/railMenus'
import { SidebarMenu } from '@/components/ui/sidebar'

/**
 * A slot, drawn as one.
 *
 * The shell takes four `ReactNode`s and arranges them; what goes in each is
 * the caller's. Filling them with a plausible case gave the gallery a second
 * app shell standing beside the real one, and told a reader nothing about
 * which part of the picture the shell is responsible for.
 */
function Slot({ name, note }: { name: string; note?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 font-mono text-xs text-ink-muted">
      {name}
      {note === undefined ? null : <span className="not-italic opacity-70">{note}</span>}
    </span>
  )
}

const ROWS = [
  { label: 'A section', icon: Square, to: '/one' },
  { label: 'Another section', icon: Square, to: '/two', count: 12 },
  { label: 'A third', icon: Square, to: '/three' },
]

const railContent = (
  <RailGroup label="A group" storageKey="sb-shell-group" holdsCurrent testId="rail-group">
    <SidebarMenu>
      {ROWS.map((row) => (
        <RailRow
          key={row.label}
          icon={row.icon}
          label={row.label}
          to={row.to}
          {...(row.count === undefined
            ? {}
            : { count: row.count, countLabel: `${String(row.count)} in ${row.label}` })}
        />
      ))}
    </SidebarMenu>
  </RailGroup>
)

/**
 * A real `Rail`, because folding it is the shell's own behaviour and a dashed
 * box cannot be folded. Its head says what it is rather than naming a case.
 */
const railHead = { icon: PanelLeft, name: 'rail', caption: 'the rail slot', menu: sessionRows }
const railUser = {
  person: { name: 'the user slot', you: true },
  caption: 'drawn only when a user is passed',
  menu: sessionRows,
}

const rail = (
  <Rail testId="rail" label="Rail slot" head={railHead} user={railUser}>
    {railContent}
  </Rail>
)

const railWithNoFooter = (
  <Rail testId="rail" label="Rail slot" head={railHead}>
    {railContent}
  </Rail>
)

const body = (
  <div className="grid h-full place-items-center rounded-md border border-dashed border-border text-center">
    <span className="inline-flex flex-col items-center gap-2 p-8 font-mono text-xs text-ink-muted">
      <LayoutGrid aria-hidden className="size-5" />
      children
      <span className="max-w-xs font-sans text-sm not-italic">
        The screen goes here, and it scrolls on its own while the rail and the
        header bar stay put.
      </span>
    </span>
  </div>
)

/**
 * The three regions the shell owns: a folding rail column, a header bar, and a
 * pane that scrolls under it.
 *
 * **What fills them is not the shell's business.** `CaseFrame` is the block
 * that puts a case in here -- the rail built from the section registry, the
 * roster, the activity door -- and `ui/src/app/picker/PickerRoute.tsx` mounts the
 * same shell with no case at all. Judge the assembled thing on `Case frame`; judge the geometry
 * here.
 *
 * Each story uses its own `collapsedKey`, so one story's persisted fold state
 * does not decide what another opens on.
 */
const meta = {
  title: 'Blocks/App shell/Shell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/one']}>
        {/* `h-dvh`: the shell FILLS, so a capped height draws it stopping
            mid-viewport with white under it -- and this is the one story whose
            whole subject is full-height chrome. */}
        <div className="h-dvh">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    triggerTestId: 'rail-trigger',
    rail,
    headerStart: <Slot name="headerStart" note="- the search box, in the app" />,
    headerEnd: <Slot name="headerEnd" note="- the roster and the doors" />,
    collapsedKey: 'sb-app-shell',
    children: body,
  },
} satisfies Meta<typeof AppShell>

export default meta
type Story = StoryObj<typeof meta>

/** Every slot filled, so the arrangement is legible. */
export const Unfolded: Story = {
  name: 'The four slots',
  args: { collapsedKey: 'sb-app-shell-open' },
  play: async ({ canvas, canvasElement }) => {
    // All four arranged: the rail beside the pane, and both header ends in
    // the bar above it.
    await expect(canvas.getByText('headerStart')).toBeVisible()
    await expect(canvas.getByText('headerEnd')).toBeVisible()

    const rail = canvasElement.querySelector('[data-testid="rail"]')!.getBoundingClientRect()
    const header = canvasElement.querySelector('header')!.getBoundingClientRect()
    await expect(rail.right).toBeLessThanOrEqual(header.left + 1)
  },
}

/** Both header slots empty: the bar keeps its height and holds only the fold control. */
export const BareHeader: Story = {
  name: 'A header with nothing in it',
  args: {
    collapsedKey: 'sb-app-shell-bare',
    headerStart: undefined,
    headerEnd: undefined,
  },
  play: async ({ canvasElement }) => {
    // The bar keeps its height with nothing in it. A header that collapsed
    // would move the whole pane up whenever a screen had nothing to put
    // there, and the fold control with it.
    const header = canvasElement.querySelector('header')!.getBoundingClientRect()
    await expect(header.height).toBeGreaterThan(40)

    const bar = within(canvasElement.querySelector('header')!)
    await expect(bar.getAllByRole('button')).toHaveLength(1)
  },
}

/** No `user` on the rail, so the foot band is not drawn at all. */
export const NoFooter: Story = {
  name: 'No rail footer',
  args: { collapsedKey: 'sb-app-shell-nofooter', rail: railWithNoFooter },
  play: async ({ canvasElement }) => {
    // The picker's shape before sign-in: no analyst, so no band.
    await expect(canvasElement.querySelector('[data-testid="rail-footer"]')).toBeNull()
  },
}

/**
 * Folded: the rail is a strip of glyphs and the pane takes the width.
 *
 * Pressed rather than declared. The shell owns its own provider and reads the
 * fold from a flag persisted under `collapsedKey`, so there is no prop to open
 * it folded -- a story that set one would render unfolded and claim otherwise.
 */
export const Folded: Story = {
  name: 'The rail folded',
  args: { collapsedKey: 'sb-app-shell-folded' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const before = canvasElement
      .querySelector('[data-testid="rail"]')!
      .getBoundingClientRect().width

    await userEvent.click(canvas.getByTestId('rail-trigger'))

    await waitFor(async () => {
      const after = canvasElement
        .querySelector('[data-testid="rail"]')!
        .getBoundingClientRect().width
      await expect(after).toBeLessThan(before)
    })
  },
}
