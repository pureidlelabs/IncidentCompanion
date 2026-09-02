import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { Boxes, CalendarClock, Footprints, Gauge, ShieldAlert } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'

import { RailGroup, RailRow } from '@/components/blocks/rail-nav'
import { Rail } from '@/components/blocks/rail'
import { AppShell } from '@/components/blocks/app-shell'
import { SidebarMenu } from '@/components/ui/sidebar'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { caseSwitcherRows } from '@/fixtures/railMenus'
import { msOf } from '@/lib/case-time'

import type { TimelineEntry } from '@/api/model'

import { TimelineScreen, type TimelineFields, type TimelineWrites } from './timeline'
import { EMPTY_CAMPAIGN } from './timeline-entries'

/**
 * The case as it happened, and the holes in it.
 *
 * Everything an analyst scans is on the row; the list is what does the other
 * three jobs - narrowing, hunting the quiet stretches, and reading the case
 * back in order for the write-up.
 */
const meta = {
  title: 'Screens/Case/Timeline',
  component: TimelineScreen,
  parameters: { layout: 'padded' },
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof TimelineScreen>

export default meta
type Story = StoryObj<typeof meta>

/** 88 entries over a week: 83 events and the 5 activities the SOC recorded. */
export const Populated: Story = {
  name: 'A week of a live campaign',
}

/** Oldest first, which is the order the case gets written up in. */
export const Oldest: Story = {
  name: 'Read forwards, for the write-up',
  args: { newestFirst: false },
}

/** The stretch between delivery and collection with nothing in it: dropped
 *  events look exactly like a source nobody collected from. */
export const BigGap: Story = {
  name: 'A hole in the record',
  args: { kase: withHole(), newestFirst: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const marks = canvasElement.querySelectorAll('[data-slot="timeline-gap"]')
    const days = canvasElement.querySelectorAll('[data-slot="timeline-day"]')
    await expect(marks.length + days.length).toBeGreaterThan(0)
    await expect(await canvas.findAllByText(/with nothing recorded/)).not.toHaveLength(0)
  },
}

/** A run of identical rows folded to one line, with the count and span on
 *  the lead row. */
export const Runs: Story = {
  name: 'Identical entries, folded',
  args: { kase: withRun(), newestFirst: false },
}

/** Activities only: what the SOC did, off the severity ramp entirely. */
export const Activities: Story = {
  name: 'Only what the SOC did',
  args: { search: '' },
  render: (args) => <TimelineScreen {...args} kase={onlyActions()} />,
}

/** The brush placed over the first stretch of the case: the one filter that
 *  is not a value an entry carries. */
export const Brushed: Story = {
  name: 'Narrowed by when',
  args: { newestFirst: false, timeWindow: brushed() },
  /** The gesture no jsdom test can make: drives the grip and counts rows
   *  either side, complementing the prop-level assertion in
   *  screens/timeline-window.test.tsx. */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = () => canvasElement.querySelectorAll('[data-slot="timeline-row"]').length
    const before = rows()
    await expect(before).toBeGreaterThan(1)

    const start = canvas.getByRole('slider', { name: /^Window start/ })
    start.focus()
    // To the far end, which is the one keystroke that moves a grip a
    // meaningful distance at this step size.
    await userEvent.keyboard('{End}')

    await expect(rows()).toBeLessThan(before)
  },
}

/** No row ticked: every checkbox is clear and the bulk bar draws nothing. */
export const NothingSelected: Story = {
  name: 'Selection: nothing ticked',
  args: { newestFirst: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('checkbox', { name: 'Select every row' })).not.toBeChecked()
    await expect(canvas.queryByText(/\d+ selected/)).toBeNull()
  },
}

/** One row ticked: the bar appears, named for exactly the one row. */
export const SomeSelected: Story = {
  name: 'Selection: one ticked',
  args: { newestFirst: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rowBoxes = canvas
      .getAllByRole('checkbox')
      .filter((box) => box.getAttribute('aria-label') !== 'Select every row')
    const first = rowBoxes[0]
    if (!first) throw new Error('the demo case has no row to tick')
    await userEvent.click(first)
    await waitFor(async () => {
      await expect(canvas.getByText('1 selected')).toBeVisible()
    })
    await expect(canvas.getByRole('button', { name: 'Delete 1' })).toBeVisible()
    // No bulk edit is offered: an event and an activity share no field.
    await expect(canvas.queryByRole('button', { name: /^Edit \d+$/ })).toBeNull()
  },
}

/** Every row ticked through the header box, and the bar names the whole case. */
export const AllSelected: Story = {
  name: 'Selection: every row ticked',
  args: { newestFirst: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const total = campaignCase.timeline.length
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select every row' }))
    await waitFor(async () => {
      await expect(canvas.getByText(`${String(total)} selected`)).toBeVisible()
    })
    await expect(
      canvas.getByRole('button', { name: `Delete ${String(total)}` }),
    ).toBeVisible()
  },
}

/** Nothing recorded yet. Both doors are offered and neither is filled. */
export const Empty: Story = {
  name: 'Nothing recorded yet',
  args: { kase: EMPTY_CAMPAIGN },
}

/** A different empty, and different words: the fix is a filter, not an entry. */
export const NoMatch: Story = {
  name: 'Filtered to nothing',
  args: { search: 'no entry says this' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No entry matches all of these filters at once'),
    ).toBeVisible()
  },
}

/** A 420px pane: the facts wrap under the sentence rather than clipping. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <TimelineScreen {...args} />
    </div>
  ),
}

/** A sentence wraps under the row; a host chain, being a reference,
 *  truncates instead. */
export const Overlong: Story = {
  name: 'A sentence too long for its row',
  args: { kase: withLongSentence() },
}

/** The screen in the frame it renders in: composition is what a gallery
 *  cannot otherwise show. */
export const InTheShell: Story = {
  name: 'Inside the shell',
  parameters: { layout: 'fullscreen' },
  play: async ({ step }) => {
    await step('the pane holds its own scroll rather than growing the page', async () => {
      // **The whole document, not the pane.** Measured at 1400x900 with the
      // 88-entry campaign case, the page scrolled 3105px past a shell that
      // ends at the viewport: the rail and the header stopped and the rows
      // carried on below them into a void. The pane was already a scroller
      // and already clipped -- what escaped it was every visually-hidden
      // span the row checkboxes carry, absolute against the initial
      // containing block because nothing between them and it was positioned.
      await expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
        document.documentElement.clientHeight + 1,
      )
    })
  },
  render: (args) => (
    <MemoryRouter initialEntries={['/timeline']}>
      <div className="h-dvh">
        <AppShell
          triggerTestId="rail-trigger"
          collapsedKey="sb-screens-timeline"
          rail={
            <Rail
              testId="rail"
              label="Case sections"
              head={{
                icon: ShieldAlert,
                name: 'DEMO-2026-031',
                caption: 'Major campaign',
                status: 'Open',
                menu: caseSwitcherRows,
              }}
            >
              <RailGroup
                label="Collect"
                storageKey="sb-screens-case-collect"
                holdsCurrent
                testId="rail-collect"
              >
                <SidebarMenu>
                  <RailRow icon={Gauge} label="Overview" to="/overview" />
                  <RailRow
                    icon={CalendarClock}
                    label="Timeline"
                    to="/timeline"
                    count={88}
                    countLabel="88 in Timeline"
                  />
                  <RailRow icon={Boxes} label="Entities" to="/entities" count={78} countLabel="78 in Entities" />
                  <RailRow icon={Footprints} label="Kill chain coverage" to="/killchain" />
                </SidebarMenu>
              </RailGroup>
            </Rail>
          }
        >
          <TimelineScreen {...args} />
        </AppShell>
      </div>
    </MemoryRouter>
  ),
}

/** A case open for a month: the campaign's week, four times over, testing
 *  whether the day headers, the folding and the scroller hold together. */
export const Dense: Story = {
  name: 'A month of entries',
  args: { kase: manyWeeks(), newestFirst: false },
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll('[data-slot="timeline-row"]')
    await expect(rows.length).toBeGreaterThan(campaignCase.timeline.length)
  },
}

/** A row another analyst saved first, named by both field and row above the
 *  body so a filter cannot hide the refusal with it. */
export const Refused: Story = {
  play: async ({ canvas, step }) => {
    await step('the refusal names both the field and the row', async () => {
      // Either alone is unactionable: the field says what to retype, the row
      // says where, and an analyst who has been away needs both.
      await expect(canvas.getByText(/Phase/)).toBeVisible()
      await expect(canvas.getByText(/Initial access/)).toBeVisible()
      await expect(canvas.getByText(/A\. Okonkwo/)).toBeVisible()
    })
  },
  name: 'A refused write',
  args: { refusal: { field: 'Phase', row: 'Initial access', by: 'A. Okonkwo' } },
}

/** The same refusal with every row filtered out, which is when it matters. */
export const RefusedWhileFiltered: Story = {
  play: async ({ canvas, step }) => {
    await step('every row is hidden', async () => {
      // The consequence rather than the query: `search` seeds the screen's own
      // state, so asserting the box's value tests the fixture, not the filter.
      await expect(canvas.queryByText(/Ransomware deployment|Mass file rename/)).toBeNull()
    })
    await step('and the refusal is still there, which is when it matters', async () => {
      // Above the body rather than on the row, so a filter cannot take the
      // refusal away with the row it is about -- and this is the state where
      // an analyst is least likely to go looking for it.
      await expect(canvas.getByText(/A\. Okonkwo/)).toBeVisible()
      await expect(canvas.getByText(/Initial access/)).toBeVisible()
    })
  },
  name: 'A refused write, with the row filtered out',
  args: {
    search: 'no-entry-matches-this',
    refusal: { field: 'Phase', row: 'Initial access', by: 'A. Okonkwo' },
  },
}

// ---------------------------------------------------------------------------

/** The campaign with its two middle days deleted, leaving one long silence. */
function withHole() {
  const stamps = campaignCase.timeline
    .map((entry) => msOf(entry.time))
    .filter((at): at is number => at !== null)
  const first = Math.min(...stamps)
  const day = 24 * 60 * 60 * 1000
  return {
    ...campaignCase,
    timeline: campaignCase.timeline.filter((entry) => {
      const at = msOf(entry.time)
      if (at === null) return true
      const since = at - first
      return since < day || since > 3 * day
    }),
  }
}

/** Five identical deliveries a minute apart, which is what an import writes. */
function withRun() {
  const lead = campaignCase.timeline[0]
  if (lead === undefined) return campaignCase
  const at = msOf(lead.time) ?? 0
  const copies = [1, 2, 3, 4].map((step) => ({
    ...lead,
    id: `${lead.id}-copy-${String(step)}`,
    time: new Date(at + step * 60_000).toISOString(),
  }))
  return { ...campaignCase, timeline: [lead, ...copies, ...campaignCase.timeline.slice(1)] }
}

/** The five activities on their own, so the three action colours are visible. */
function onlyActions() {
  return {
    ...campaignCase,
    timeline: campaignCase.timeline.filter((entry) => entry.kind === 'action'),
  }
}

/** One entry whose sentence and host chain both run past their columns. */
function withLongSentence() {
  const [lead, ...rest] = campaignCase.timeline
  if (lead === undefined) return campaignCase
  return {
    ...campaignCase,
    timeline: [
      {
        ...lead,
        description:
          'Macro-enabled attachment opened on nine Meridian finance mailboxes, dropping a signed loader that beaconed to mega-sync-store.example within four minutes and staged credential theft against the backup service account',
      },
      ...rest,
    ],
  }
}

/** A window over the first quarter of the campaign, which is where it burns. */
function brushed() {
  const stamps = campaignCase.timeline
    .map((entry) => msOf(entry.time))
    .filter((at): at is number => at !== null)
  const first = Math.min(...stamps)
  const last = Math.max(...stamps)
  return { from: first, to: first + Math.round((last - first) / 4) }
}

/** The campaign's week repeated over four, each copy a week further on. */
function manyWeeks() {
  const week = 7 * 24 * 60 * 60 * 1000
  return {
    ...campaignCase,
    timeline: [0, 1, 2, 3].flatMap((step) =>
      campaignCase.timeline.map((entry) => {
        const at = msOf(entry.time)
        return {
          ...entry,
          id: `${entry.id}-week-${String(step)}`,
          time: at === null ? entry.time : new Date(at + step * week).toISOString(),
        }
      }),
    ),
  }
}

// ---------------------------------------------------------------------------
// Served by a container
// ---------------------------------------------------------------------------

// Below: served by a container, and each story below creates its own spies
// -- sharing one set makes a call count depend on which story ran first.
/** A container that never answers, so a write stays in flight. */
function never(): TimelineWrites {
  return {
    save: fn(() => new Promise<TimelineEntry>(() => undefined)),
    remove: fn(() => new Promise<void>(() => undefined)),
  }
}

/** A container that answers at once, with the row it stored. */
function answering(): TimelineWrites {
  return {
    save: fn((entry: TimelineEntry | null, fields: TimelineFields) =>
      Promise.resolve({
        ...(entry ?? campaignCase.timeline[0]!),
        ...fields,
        id: entry?.id ?? 'tl-stored',
      }),
    ),
    remove: fn(() => Promise.resolve()),
  }
}

/** One event and one activity, oldest first, so a row is named by its kind. */
function bothKinds() {
  const event = campaignCase.timeline.find((entry) => entry.kind === 'event')
  const activity = campaignCase.timeline.find((entry) => entry.kind === 'action')
  if (!event || !activity) throw new Error('the demo case holds only one kind of entry')
  return { ...campaignCase, timeline: [event, activity] }
}

/**
 * Two entries a run folds into one line, and a third beside them.
 *
 * The pair share every field a run is grouped on and differ only in their id,
 * which is what a bulk delete has to name them by. A screen filtering the list
 * by the fields instead takes both when one was ticked, and the count on
 * screen agrees with it.
 */
function withTwins() {
  const [lead, next] = campaignCase.timeline
  if (!lead || !next) throw new Error('the demo case is too short to fold a run')
  const twin = {
    ...lead,
    id: `${lead.id}-twin`,
    time: new Date((msOf(lead.time) ?? 0) + 60_000).toISOString(),
  }
  return { ...campaignCase, timeline: [lead, twin, next] }
}

/** Served and quiet: nothing in flight, so it reads exactly like the gallery. */
export const Served: Story = {
  name: 'Served by a container',
  args: { writes: answering() },
}

// Not asserted below: the two add doors and the pencil open `EntityDialog`,
// whose Create refuses before an assertion is reached -- an event and an
// activity validate against different schemas, so `problemsIn` takes its
// no-schema branch. Coverage stops at `save` on a stored row and `remove`.
/** A row marked unreviewed from its own menu, saving only the one field it
 *  set. */
export const Reviewed: Story = {
  name: 'A review flag sent to its container',
  args: { kase: bothKinds(), newestFirst: false, writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const menus = await canvas.findAllByRole('button', { name: /^More for / })
    await userEvent.click(menus[0]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark unreviewed' }))
    await expect(args.writes!.save).toHaveBeenCalledOnce()
    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: bothKinds().timeline[0]!.id }),
      { unreviewed: true },
      'event',
    )
  },
}

/** The same flag on the activity beside it, so both kinds are covered by
 *  name. */
export const ReviewedActivity: Story = {
  name: 'A review flag on an activity',
  args: { kase: bothKinds(), newestFirst: false, writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const menus = await canvas.findAllByRole('button', { name: /^More for / })
    await userEvent.click(menus[1]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark unreviewed' }))
    await expect(args.writes!.save).toHaveBeenCalledOnce()
    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: bothKinds().timeline[1]!.id }),
      { unreviewed: true },
      'action',
    )
  },
}

/** One row deleted from its own bin, with no confirmation: the second line,
 *  since the first two entries fold into one. */
export const RowDeleted: Story = {
  name: 'A row delete sent to its container',
  args: { kase: withTwins(), newestFirst: false, writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const bins = await canvas.findAllByRole('button', { name: /^Delete / })
    await userEvent.click(bins[1]!)
    await expect(args.writes!.remove).toHaveBeenCalledOnce()
    await expect(args.writes!.remove).toHaveBeenCalledWith([withTwins().timeline[2]!.id])
  },
}

/** A delete the container has not answered: the row stays, since removing
 *  it before the server answers is the optimistic path this project
 *  refuses. */
export const RemovePending: Story = {
  name: 'A delete with no answer yet',
  args: { kase: bothKinds(), newestFirst: false, writes: never() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = () => canvasElement.querySelectorAll('[data-slot="timeline-row"]').length
    const before = rows()
    await userEvent.click((await canvas.findAllByRole('button', { name: /^Delete / }))[0]!)
    await expect(args.writes!.remove).toHaveBeenCalledOnce()
    await expect(rows()).toBe(before)
  },
}

/** Every row ticked and deleted at once, the folded pair included: all
 *  three ids leave named. */
export const BulkDeleted: Story = {
  name: 'A bulk delete sent to its container',
  args: { kase: withTwins(), newestFirst: false, writes: answering() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    // Three entries on two lines, which is what makes the assertion below say
    // anything: a selection resolved off the lines would name two.
    await expect(canvasElement.querySelectorAll('[data-slot="timeline-row"]')).toHaveLength(2)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select every row' }))
    await userEvent.click(await canvas.findByRole('button', { name: /^Delete \d+$/ }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))
    await expect(args.writes!.remove).toHaveBeenCalledOnce()
    await expect(args.writes!.remove).toHaveBeenCalledWith(
      withTwins().timeline.map((entry) => entry.id),
    )
  },
}
