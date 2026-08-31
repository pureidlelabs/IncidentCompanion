import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { expect } from 'storybook/test'

import {
  CommandPalette,
  paletteFuzzyMatches,
  paletteRank,
  type PaletteGroup,
  type PaletteItem,
} from '@/components/blocks/command-palette'

const ACTIONS: readonly PaletteItem[] = [
  { id: 'new-doc', label: 'New document', chord: [{ key: 'n', mod: true }] },
  { id: 'save', label: 'Save', chord: [{ key: 's', mod: true }] },
  { id: 'share', label: 'Share', chord: [{ key: 's', mod: true, shift: true }] },
]

const DESTINATIONS: readonly PaletteItem[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'billing', label: 'Billing' },
  { id: 'members', label: 'Members' },
]

const RECENT: readonly PaletteItem[] = [
  { id: 'doc-1', label: 'Q3 renewal letter', hint: 'Letters' },
  { id: 'doc-2', label: 'Onboarding checklist', hint: 'Checklists' },
]

/** Narrows a fixed set of items by label, the way a caller with a short, known
 *  list of rows would - a long corpus wants its own matcher instead. */
function filtered(query: string, items: readonly PaletteItem[]): PaletteItem[] {
  const trimmed = query.trim()
  return items
    .filter((one) => trimmed === '' || paletteFuzzyMatches(trimmed, one.label))
    .sort((left, right) => paletteRank(trimmed, left.label) - paletteRank(trimmed, right.label))
}

/**
 * A search field over grouped rows, each ending in a chord or a hint chip.
 *
 * **The palette matches a subsequence, so typing an acronym reaches a row**:
 * `csett` finds Case settings, `tl` finds Timeline. That over-matches on a
 * long corpus, so a caller searching one brings its own matcher.
 *
 * Matching and ranking are separate. Matching decides what an analyst can
 * reach; ranking decides what the first Enter lands on, putting a prefix above
 * a word found later and both above a bare subsequence. Both are asserted in
 * `command-palette.test.ts`; the stories below assert what a predicate cannot
 * see -- that typing moves the list, and that an empty group draws no heading.
 */
const meta = {
  title: 'Blocks/List/Command palette',
  component: CommandPalette,
  parameters: { layout: 'padded' },
  args: {
    title: 'Command palette',
    description: 'Jump to a page, a recent document, or run an action.',
    placeholder: 'Jump to a page, a document, or an action',
    emptyLabel: 'Nothing matches.',
    query: '',
    onQueryChange: () => undefined,
    groups: [],
  },
} satisfies Meta<typeof CommandPalette>

export default meta
type Story = StoryObj<typeof meta>

/** A controlled palette over a fixed set of rows, for a story to type into. */
function Typing({ initial = '' }: { initial?: string }) {
  const [query, setQuery] = useState(initial)
  const groups: PaletteGroup[] = useMemo(
    () => [
      { label: 'Actions', items: filtered(query, ACTIONS) },
      { label: 'Go to', items: filtered(query, DESTINATIONS) },
      // Recent appears once something is typed, and narrows with everything
      // else. Offered unfiltered it survived every query, so nothing could
      // reach the empty state through this helper.
      { label: 'Recent', items: query.trim() === '' ? [] : filtered(query, RECENT) },
    ],
    [query],
  )
  return (
    <CommandPalette
      title="Command palette"
      description="Jump to a page, a recent document, or run an action."
      placeholder="Jump to a page, a document, or an action"
      emptyLabel="Nothing matches."
      query={query}
      onQueryChange={setQuery}
      groups={groups}
    />
  )
}

/**
 * Nothing typed: every group is offered whole, except the ones a caller only
 * fills once there is a query.
 */
export const JustOpened: Story = {
  name: 'Just opened',
  render: () => <Typing />,
  play: async ({ canvas }) => {
    // The rows are one named list, not three: a screen reader reading them
    // hears where it is, and the group headings are visual grouping only.
    await expect(canvas.getByRole('listbox', { name: 'Results' })).toBeVisible()
    await expect(canvas.getByRole('option', { name: /new document/i })).toBeVisible()
    await expect(canvas.getByRole('option', { name: /settings/i })).toBeVisible()
    // `Recent` is filled only once something is typed, so its heading is absent.
    await expect(canvas.queryByText('Recent')).not.toBeInTheDocument()
  },
}

/**
 * One letter narrows every group at once, and the groups that empty take
 * their headings with them.
 *
 * A heading over nothing reads as a group that failed to load.
 */
export const Filtered: Story = {
  name: 'A query narrows every group',
  render: () => <Typing initial="s" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('option', { name: /save/i })).toBeVisible()
    await expect(canvas.getByRole('option', { name: /settings/i })).toBeVisible()
    // `Billing` holds no `s`, so it is gone rather than merely reordered.
    await expect(canvas.queryByRole('option', { name: /billing/i })).not.toBeInTheDocument()
  },
}

/**
 * A query nothing matches says so once, rather than drawing three empty
 * groups.
 */
export const NoMatch: Story = {
  name: 'A query matching nothing',
  render: () => <Typing initial="zzzz nothing here" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing matches.')).toBeVisible()
    await expect(canvas.queryAllByRole('option')).toHaveLength(0)
    // One sentence, not three empty groups under three headings.
    await expect(canvas.queryByText('Actions')).not.toBeInTheDocument()
  },
}

/** A row with no destination and no chord: the end of the row draws nothing. */
export const Bare: Story = {
  name: 'A row with neither a chord nor a hint',
  args: {
    groups: [{ label: 'Go to', items: [{ id: 'home', label: 'Home' }] }],
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('option', { name: 'Home' })).toBeVisible()
    await expect(canvasElement.querySelector('[data-slot="chord-keys"]')).toBeNull()
  },
}

/**
 * No groups at all, which is what a palette opens as before its caller has
 * anything to offer.
 */
export const Empty: Story = {
  name: 'No groups at all',
  args: { groups: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Nothing matches.')).toBeVisible()
    await expect(canvas.queryAllByRole('option')).toHaveLength(0)
  },
}

/**
 * A 380px pane.
 *
 * A row's label truncates and its chord or hint chip keeps its place at the
 * end, rather than the two swapping order as the panel narrows.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: () => (
    <div className="w-[380px] border border-dashed border-border p-2">
      <Typing initial="s" />
    </div>
  ),
}

/**
 * Every command an install offers, which is the state a palette is actually
 * used in.
 *
 * The list scrolls rather than the page, so the search box stays reachable
 * with four hundred rows under it -- a palette a reader has to scroll back up
 * through to retype is one they leave.
 */
export const TooMuchData: Story = {
  name: 'Four hundred commands',
  render: function Bulk() {
    const [query, setQuery] = useState('')
    const many: PaletteItem[] = useMemo(
      () =>
        Array.from({ length: 400 }, (_, i) => ({
          id: `cmd-${String(i)}`,
          label: `Open the ${String(i)} case review`,
          // Spread rather than set to `undefined`: under
          // `exactOptionalPropertyTypes` an absent key and a key holding
          // `undefined` are different types.
          ...(i % 3 === 0 ? { hint: 'Recently opened' } : {}),
        })),
      [],
    )
    return (
      <CommandPalette
        title="Command palette"
        description="Jump to a page, a recent document, or run an action."
        placeholder="Jump to a page, a document, or an action"
        emptyLabel="Nothing matches."
        query={query}
        onQueryChange={setQuery}
        groups={[{ label: 'Go to', items: filtered(query, many) }]}
      />
    )
  },
  play: async ({ canvas, userEvent }) => {
    // A `SearchField`, so the role is `searchbox` rather than `textbox`.
    const box = canvas.getByRole('searchbox')
    await expect(canvas.getAllByRole('option').length).toBeGreaterThan(50)

    // The rows scroll, not the page: the box a reader types into stays where
    // it was rather than being carried off the top by its own results.
    const before = box.getBoundingClientRect().top
    const list = canvas.getByRole('listbox')
    list.scrollTop = 400
    await expect(box.getBoundingClientRect().top).toBeCloseTo(before, 0)
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)

    await userEvent.type(box, 'the 37 case')
    await expect(await canvas.findByRole('option', { name: /the 37 case/i })).toBeVisible()
  },
}

/**
 * The longest label an install would put on a command.
 *
 * A row truncates rather than wrapping to two lines: a palette is scanned
 * down, and rows of unequal height make that a slower read than the length of
 * any one of them costs.
 */
export const TheLongestLabel: Story = {
  name: 'A command named at length',
  args: {
    groups: [
      {
        label: 'Go to',
        items: [
          {
            id: 'long',
            label:
              'Open the quarterly ransomware readiness review for the '
              + 'Meridian Logistics engagement and jump to its findings',
            hint: 'A section inside a case somebody named after the whole engagement',
          },
        ],
      },
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    const row = canvas.getAllByRole('option')[0]!
    const box = canvasElement.getBoundingClientRect()

    await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(box.right + 1)
    // One line, not two: the row is no taller than a short one would be.
    await expect(row.getBoundingClientRect().height).toBeLessThan(80)
  },
}
