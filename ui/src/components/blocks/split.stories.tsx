import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { EmptyState } from '@/components/blocks/empty-state'
import { Split } from '@/components/blocks/split'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListBox, ListBoxItem } from '@/components/ui/list-box'
import { SearchField } from '@/components/ui/search-field'
import { campaignCase } from '@/fixtures/campaign'

const EVENTS = campaignCase.timeline
const SYSTEMS = campaignCase.systems

/** One label-and-value line in the detail pane. The blocks tier owns the real one. */
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-4 border-b border-border py-1.5 last:border-b-0">
      <dt className="w-32 shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{value === null || value === undefined || value === '' ? '\u2014' : value}</dd>
    </div>
  )
}

/** Every entry with a description, keyed by its position so the list is stable. */
const ENTRIES = EVENTS.map((entry, index) => ({ ...entry, key: String(index) }))

/** The list, the detail, and the search box that narrows the list. */
function TimelineSplit({ start }: { start: string | null }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(start)
  const rows = ENTRIES.filter((entry) =>
    entry.description.toLowerCase().includes(query.toLowerCase()),
  )
  const entry = rows.find((row) => row.key === open)

  return (
    <Split
      listHead={
        <SearchField
          aria-label="Search the timeline"
          placeholder="Search entries&#x2026;"
          value={query}
          onChange={setQuery}
        />
      }
      listFooter={
        <Button variant="outline" size="sm" className="w-full">
          <Plus aria-hidden />
          Add entry
        </Button>
      }
      list={
        <ListBox
          aria-label="Timeline entries"
          selectionMode="single"
          selectedKeys={open === null ? [] : [open]}
          onSelectionChange={(keys) => {
            // `Selection` is `'all' | Set<Key>`, and spreading the string arm
            // yields its characters. Single selection never sends `'all'`, so
            // this is the type being honest rather than a case to handle.
            if (keys === 'all') return
            const [first] = keys
            setOpen(first === undefined ? null : String(first))
          }}
          items={rows}
        >
          {(row) => (
            <ListBoxItem id={row.key} textValue={row.description}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate">{row.description}</span>
                {/* The caption has to follow the selected ground, or it is
                    dark grey on the primary blue and unreadable. The item is a
                    `group`, so the kit's own idiom applies - `menu.tsx` does
                    the same on its focus state. */}
                <span className="truncate text-2xs text-ink-muted group-selected:text-on-primary/85">
                  {row.kind} &middot; {row.tactic === '' ? 'no tactic' : row.tactic}
                </span>
              </span>
            </ListBoxItem>
          )}
        </ListBox>
      }
      detailHead={
        entry === undefined ? undefined : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="truncate text-base font-medium">{entry.description}</h2>
              <span className="text-xs text-ink-muted">{entry.eventSource}</span>
            </div>
            <Badge variant="soft" size="xs">
              {entry.kind}
            </Badge>
          </div>
        )
      }
      placeholder={
        <EmptyState
          title="Nothing open"
          detail={`Pick one of ${String(rows.length)} entries to read it here.`}
        />
      }
      {...(entry === undefined
        ? {}
        : {
            detail: (
              <dl className="flex flex-col">
                <Row label="Kind" value={entry.kind} />
                <Row label="Source" value={entry.eventSource} />
                <Row label="Tactic" value={entry.tactic} />
                <Row label="Technique" value={entry.technique} />
                <Row label="Severity" value={entry.severity} />
                <Row label="Time" value={entry.time} />
              </dl>
            ),
          })}
    />
  )
}

/**
 * A list beside what is open from it.
 */
const meta = {
  title: 'Blocks/Layout/Split',
  component: Split,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
  args: { list: null },
} satisfies Meta<typeof Split>

export default meta
type Story = StoryObj<typeof meta>

/** The list pane's drawn width, which is what `measure` decides. */
function listWidth(canvasElement: HTMLElement): number {
  const list = canvasElement.querySelector('[data-slot="split-list"]')!
  return Math.round(list.getBoundingClientRect().width)
}

/**
 * The two head cells, level because they are one grid row.
 *
 * Asserted on `top` and `bottom` rather than on height alone: two bands of
 * equal height starting at different y still meet at a step, which is the
 * defect this is here to catch.
 */
async function headsAreOneRow(canvasElement: HTMLElement): Promise<void> {
  const cell = (slot: string): DOMRect =>
    canvasElement.querySelector(`[data-slot="${slot}"]`)!.getBoundingClientRect()
  const list = cell('split-list-head')
  const detail = cell('split-detail-head')
  await expect(list.height).toBeGreaterThan(0)
  await expect(list.top).toBe(detail.top)
  await expect(list.bottom).toBe(detail.bottom)
}


/**
 * The fixture's 88 timeline entries in the list, one of them open.
 */
export const Open: Story = {
  name: 'One entry open',
  render: () => <TimelineSplit start="4" />,
  /**
   * The default measure, and the two scrollers that are the layout's headline
   * claim.
   */
  play: async ({ canvasElement }) => {
    await expect(listWidth(canvasElement)).toBe(320)

    // A search field on one side and a title over a source line on the other,
    // in one grid row rather than one band each.
    await headsAreOneRow(canvasElement)

    // One scroller per pane, each the pane's own child rather than something
    // the caller's content brought - a `ListBox` carries scrollers of its own.
    const own = (slot: string): Element[] =>
      [...(canvasElement.querySelector(slot)?.children ?? [])].filter(
        (el) => getComputedStyle(el).overflowY === 'auto',
      )
    const listScrollers = own('[data-slot="split-list"]')
    const detailScrollers = own('[data-slot="split-detail"]')
    await expect(listScrollers).toHaveLength(1)
    await expect(detailScrollers).toHaveLength(1)
    const detailPane = detailScrollers[0]!
    await expect(listScrollers[0]).not.toBe(detailPane)

    // Both reserve the gutter. Without it the pane's content shifts sideways
    // by the scrollbar's width the moment a longer detail opens, and nothing
    // on screen says why the whole column moved.
    for (const pane of [...listScrollers, ...detailScrollers]) {
      await expect(getComputedStyle(pane).scrollbarGutter).toBe('stable')
    }

    // The kit's `ListBox` is `overflow-auto` itself, so the rows move inside it
    // and the pane's own box never overflows. The independence claim is about
    // the two columns, so it is asserted against whatever actually moves.
    const box = canvasElement.querySelector('[role="listbox"]')!
    await expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
    const firstRow = box.firstElementChild!
    const rowTop = firstRow.getBoundingClientRect().top

    // The detail is long enough to have somewhere of its own to go.
    await expect(detailPane.scrollHeight).toBeGreaterThan(0)
    const detailTop = detailPane.scrollTop

    box.scrollTop = 200
    await expect(box.scrollTop).toBe(200)
    await expect(firstRow.getBoundingClientRect().top).toBeLessThan(rowTop)
    // The whole reason the two scrollers are separate: a forty-row index does
    // not move because the report beside it is long, and vice versa.
    await expect(detailPane.scrollTop).toBe(detailTop)
  },
}

/** Nothing open, so the detail pane draws `placeholder`. The list is unchanged. */
export const Nothing: Story = {
  name: 'Nothing open',
  render: () => <TimelineSplit start={null} />,
}

/** `measure: 'narrow'` for a list of short labels rather than of sentences. */
export const Narrow: Story = {
  name: 'A narrow list pane',
  play: async ({ canvasElement }) => {
    await expect(listWidth(canvasElement)).toBe(256)
    // A detail head and no list head: the list still gets its cell, or the
    // list's rows start a band higher than the detail's and the seam steps.
    //
    // It is the *presence* of the empty cell this catches, not the equality:
    // this detail head is one line, so `min-h-11` alone would hold the pair at
    // 44 apiece and the height half of the claim is vacuous here. `Lopsided`
    // is where that half bites.
    await headsAreOneRow(canvasElement)
  },
  render: () => (
    <Split
      measure="narrow"
      list={
        <ListBox aria-label="Systems" selectionMode="single" items={SYSTEMS}>
          {(row) => <ListBoxItem id={row.id}>{row.hostname}</ListBoxItem>}
        </ListBox>
      }
      detailHead={<h2 className="text-base font-medium">{SYSTEMS[0]?.hostname}</h2>}
      detail={
        <dl className="flex flex-col">
          <Row label="Type" value={SYSTEMS[0]?.systemType ?? ''} />
          <Row label="Zone" value={SYSTEMS[0]?.zone ?? ''} />
          <Row label="Verdict" value={SYSTEMS[0]?.verdict ?? ''} />
          <Row label="Analyst" value={SYSTEMS[0]?.analyst ?? ''} />
        </dl>
      }
    />
  ),
}

/**
 * The default measure inside a 480px container, where a fixed 20rem starves
 * the detail.
 */
export const Starved: Story = {
  name: 'A 480px container',
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector('[data-slot="split"]')!.getBoundingClientRect()
    await expect(Math.round(box.width)).toBe(480)

    // 40% of the container, well short of the 320 a fixed measure would take.
    await expect(listWidth(canvasElement)).toBe(192)

    const detail = canvasElement
      .querySelector('[data-slot="split-detail"]')!
      .getBoundingClientRect()
    // What a note needs to read at all, before the pane's own `px-5`.
    await expect(Math.round(detail.width)).toBeGreaterThanOrEqual(280)
  },
  render: () => (
    <div className="flex h-[520px] w-[480px] flex-col">
      <TimelineSplit start="4" />
    </div>
  ),
}

/**
 * A one-line head beside one that wraps to four, which is the case a floor
 * cannot answer.
 */
export const Lopsided: Story = {
  name: 'One head far taller than the other',
  play: async ({ canvasElement }) => {
    await headsAreOneRow(canvasElement)
    // Not two floors that happen to agree: the row is set by the taller head,
    // and both cells are that tall.
    const head = canvasElement.querySelector('[data-slot="split-list-head"]')!
    await expect(head.getBoundingClientRect().height).toBeGreaterThan(44)
  },
  render: () => (
    <Split
      listHead={<p className="text-micro uppercase tracking-micro text-ink-muted">Newest first</p>}
      list={
        <ListBox aria-label="Systems" selectionMode="single" items={SYSTEMS}>
          {(row) => <ListBoxItem id={row.id}>{row.hostname}</ListBoxItem>}
        </ListBox>
      }
      detailHead={
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium">
            {ENTRIES[0]?.description ?? 'An entry with a very long description indeed'}
          </h2>
          <span className="text-xs text-ink-muted">{ENTRIES[0]?.eventSource}</span>
          <span className="text-xs text-ink-muted">{ENTRIES[0]?.time}</span>
          <span className="text-xs text-ink-muted">{ENTRIES[0]?.tactic}</span>
        </div>
      }
      detail={<p className="text-sm">Whatever is open.</p>}
    />
  ),
}

/** No head and no footer on either pane: the two scrollers alone. */
export const Bare: Story = {
  name: 'No heads, no footers',
  play: async ({ canvasElement }) => {
    // `measure: 'wide'`, which had no assertion of any kind before this.
    await expect(listWidth(canvasElement)).toBe(384)
    // No head and no footer means the list pane holds the scroller alone.
    const list = canvasElement.querySelector('[data-slot="split-list"]')!
    await expect(list.children).toHaveLength(1)
  },
  render: () => (
    <Split
      measure="wide"
      list={
        <ListBox aria-label="Timeline entries" selectionMode="single" items={ENTRIES}>
          {(row) => (
            <ListBoxItem id={row.key} textValue={row.description}>
              {row.description}
            </ListBoxItem>
          )}
        </ListBox>
      }
      placeholder={<EmptyState title="Nothing open" detail="Pick an entry from the list." />}
    />
  ),
}
