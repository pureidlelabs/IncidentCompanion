import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { useState } from 'react'

import type { ReportBlock } from '@/api/model'
import {
  BLOCKS_WITH_AN_UNRESOLVED_HEADING,
  DEMO_BLOCKS,
  DEMO_PROSE,
  blocksOf,
  demoReport,
  headingOf,
} from '@/components/blocks/report-shape'
import { campaignCase } from '@/fixtures/campaign'
import { bareInACase } from '@/fixtures/in-a-case'

import { ReportWorkspace, type ReportWorkspaceProps } from './report-workspace'

/**
 * One report, in the three ways there are to look at it.
 */
const meta = {
  title: 'Blocks/Report/Workspace',
  component: ReportWorkspace,
  parameters: { layout: 'fullscreen' },
  // Editable, which is the ordinary case: a report nobody may edit is the
  // `Frozen` story, and it is the absence of this control that it is about.
  // It records the kind it was handed: the menu draws twenty-two items whose
  // words are the analyst's and whose keys are the registry's, and only the
  // key tells a container which section to write.
  // `onReorder` beside it for the same reason: the grips are drawn on the
  // seam's presence, so a report that may be rearranged is one whose caller
  // is listening for a new order. It records the whole id list, which is the
  // route's own body -- an order that only moved on screen is the defect the
  // `Rearranged` story is about.
  args: {
    onAddSection: fn(),
    onReorder: fn(),
    blocks: DEMO_BLOCKS,
    kase: campaignCase,
    prose: DEMO_PROSE,
  },
  decorators: [bareInACase],
} satisfies Meta<typeof ReportWorkspace>

export default meta
type Story = StoryObj<typeof meta>

const first = demoReport(0)
const firstBlocks = blocksOf(DEMO_BLOCKS, first.id)
const firstWritten = firstBlocks.find((block) => block.kind === 'written')

/**
 * A report far longer than any fixture: sixty sections in one.
 */
export const ManySections: Story = {
  name: 'Sixty sections in one report',
  args: {
    blocks: [
      ...DEMO_BLOCKS,
      ...Array.from({ length: 60 }, (_, at) => ({
        ...firstBlocks[0]!,
        id: `bulk-${String(at)}`,
        position: 1000 + at,
        // `heading`, not `title`: `headingOf` reads that first and falls back
        // to the block kind's label, so a title alone renders sixty rows all
        // called the same thing.
        heading: `Section ${String(at + 1)}`,
      })),
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the last section is drawn in the page and named in the rail', async () => {
      // Two of each: the rail is the index and the page is the document. A
      // heading appearing in only one of them means the rail has silently
      // stopped at some length.
      await expect(canvas.getAllByText('Section 60')).toHaveLength(2)
      await expect(canvas.getAllByText('Section 1')).toHaveLength(2)
    })
  },
}

/**
 * The customer RCA part-written: one section holding two paragraphs, one empty,
 * and the generated rest.
 */
export const PartWritten: Story = { name: 'A report part-written' }

/**
 * The rail follows the caret rather than the scroll.
 */
export const RailFollowsTheCaret: Story = {
  name: 'The rail follows the caret',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rail = await canvas.findByTestId('report-section-rail')
    const rows = within(rail).getAllByRole('button')
    const target = rows[3]
    await expect(target).toBeDefined()
    if (target === undefined) return
    await expect(rows.filter((row) => row.getAttribute('aria-current') === 'true')).toHaveLength(0)
    await userEvent.click(target)
    await waitFor(async () => {
      await expect(target).toHaveAttribute('aria-current', 'true')
    })
  },
}

/**
 * The page beside the column, painted from what is being typed.
 */
export const BesideThePage: Story = {
  name: 'Compose beside the page',
  args: { view: 'paper' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(firstWritten).toBeDefined()
    if (firstWritten === undefined) return
    const page = await canvas.findByLabelText('The printed page')
    const body = await canvas.findByRole('textbox', { name: headingOf(firstWritten) })
    await userEvent.click(body)
    await userEvent.type(body, ' Typed while the page was open.')
    await waitFor(async () => {
      await expect(within(page).getByText(/Typed while the page was open\./)).toBeVisible()
    })
  },
}

/**
 * Nothing written anywhere, which is what a case looks like the moment a layout
 * is seeded.
 */
export const NothingWritten: Story = {
  name: 'Nothing written yet',
  args: {
    blocks: DEMO_BLOCKS.map((block) => ({ ...block, hasProse: false })),
    prose: {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rail = await canvas.findByTestId('report-section-rail')
    await expect(within(rail).getAllByText('empty').length).toBeGreaterThan(0)
  },
}

/**
 * The menu offers the kinds it was handed.
 */
export const KindsFromTheServer: Story = {
  name: 'Add section \u2014 the served kinds',
  args: {
    onAddSection: fn(),
    blockKinds: [
      { heading: 'What this install serves', kinds: [{ kind: 'written', label: 'A served kind' }] },
    ],
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getAllByRole('button', { name: /add section/i })[0]!)
    const menu = within(await screen.findByRole('menu'))

    await step('it draws what it was given', async () => {
      await expect(await menu.findByText('A served kind')).toBeInTheDocument()
    })

    await step('and nothing the bundle happens to carry', async () => {
      // A heading the fixture has and this list does not: drawn, the menu is
      // reading its own copy rather than the answer it was handed.
      await expect(menu.queryByText('The case in short')).toBeNull()
    })
  },
}

/**
 * The three views are named, not described.
 */
export const ViewsAreNamed: Story = {
  name: 'The view switch, named',
  play: async ({ canvas, step }) => {
    await step('each view has a name a reader can scan', async () => {
      for (const name of ['Compose', 'Page', 'Document']) {
        await expect(canvas.getByRole('radio', { name })).toBeInTheDocument()
      }
    })
  },
}

/**
 * A report already sent: it renders every section, offers no way to add one,
 * and refuses every edit.
 */
export const Frozen: Story = {
  name: 'A report already sent',
  args: {
    report: { ...first, status: 'final', sentAt: '2026-08-19T09:00:00.000Z' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Add section' })).toBeNull()
    // And no grip either, for the same reason: the sections are a document
    // here rather than a thing to rearrange.
    await expect(canvas.queryAllByRole('button', { name: /^Drag / })).toHaveLength(0)
    const rail = await canvas.findByTestId('report-section-rail')
    await expect(within(rail).queryByText('empty')).toBeNull()
  },
}

/** The document that leaves, on a report that has not left: there are no bytes. */
export const Preview: Story = {
  name: 'The rendered file, which this tier has not got',
  args: { view: 'preview' },
}

/** The same view on a sent report, which previews its own frozen copy. */
export const PreviewFrozen: Story = {
  name: 'The copy that was sent',
  args: {
    view: 'preview',
    report: { ...first, status: 'final', sentAt: '2026-08-19T09:00:00.000Z' },
  },
}

/** A heading the language pack cannot resolve stays a key, and says so. */
export const UnresolvedHeading: Story = {
  name: 'A heading the pack did not resolve',
  args: { blocks: BLOCKS_WITH_AN_UNRESOLVED_HEADING },
}

/** A report with no sections, which is a blank shape before anything is added. */
export const NoSections: Story = {
  name: 'A report with no sections',
  args: { blocks: [] },
}

/**
 * A kind chosen from the menu, on a report that has nothing yet.
 */
export const SectionKindChosen: Story = {
  name: 'A kind chosen from the menu',
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Add section' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Kill chain coverage' }))
    await expect(args.onAddSection).toHaveBeenCalledOnce()
    await expect(args.onAddSection).toHaveBeenCalledWith('killchain')
  },
}

/**
 * A 760px window: the rail and the page both fold away, and the column keeps
 * its measure.
 */
export const Narrow: Story = {
  name: 'A narrow window',
  args: { view: 'paper' },
  render: (args) => (
    <div className="flex h-dvh w-[760px] flex-col overflow-y-auto border-r border-dashed border-border">
      <ReportWorkspace {...args} />
    </div>
  ),
}

/** A label and a heading past the room they have. */
export const Overlong: Story = {
  name: 'A label too long for the strip',
  args: {
    report: {
      ...first,
      label:
        'Meridian Logistics root cause analysis and containment record, for the customer and their insurer',
    },
    blocks: DEMO_BLOCKS.map((block) =>
      block.id === firstWritten?.id
        ? {
            ...block,
            heading:
              'Executive summary, including the containment timeline and what the customer has to decide',
          }
        : block,
    ),
    prose: {
      ...DEMO_PROSE,
      ...(firstWritten === undefined
        ? {}
        : {
            [firstWritten.id]:
              'A single unbroken line with no spaces would test the wrong thing, so this is ordinary prose long enough to wrap several times inside the measure the column gives it, which is what the analyst actually writes into a report section they are finishing at the end of a shift.',
          }),
    },
  },
}

/**
 * A report of forty sections, which is what a long filing runs to.
 */
export const Dense: Story = {
  name: 'A report of forty sections',
  args: { blocks: manySections() },
  // The rail is the only way through a document this long, so a rail that
  // stopped at the first pass is the defect.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rail = await canvas.findByTestId('report-section-rail')
    await expect(within(rail).getAllByRole('button').length).toBeGreaterThan(20)
  },
}

/** The report's own sections eight times over, renumbered in reading order. */
function manySections() {
  const own = blocksOf(DEMO_BLOCKS, first.id)
  return [0, 1, 2, 3, 4, 5, 6, 7].flatMap((pass) =>
    own.map((block, at) => ({
      ...block,
      id: `${block.id}-pass-${String(pass)}`,
      position: pass * own.length + at,
    })),
  )
}

/**
 * A section picked up and not yet dropped.
 */
export const MidDrag: Story = {
  name: 'A section picked up',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const moved = firstBlocks[0]
    await expect(moved).toBeDefined()
    if (moved === undefined) return

    const grip = await canvas.findByRole('button', { name: `Drag ${headingOf(moved)}` })
    grip.focus()
    await userEvent.keyboard('{Enter}')

    // The gaps exist and one of them has the focus, which is what says the
    // section is up rather than that a button was pressed.
    await waitFor(async () => {
      await expect(canvas.getAllByRole('button', { name: /^Insert / }).length).toBeGreaterThan(1)
    })
    await expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(/^Insert /)

    await userEvent.keyboard('{Escape}')
    await waitFor(async () => {
      await expect(canvas.queryAllByRole('button', { name: /^Insert / })).toHaveLength(0)
    })
  },
}

/**
 * The document holding its own order, so a drop moves the sections on screen.
 */
function Rearranging({ onReorder, blocks = DEMO_BLOCKS, ...rest }: ReportWorkspaceProps) {
  const [order, setOrder] = useState<readonly string[]>(() =>
    blocksOf(blocks, first.id).map((block) => block.id),
  )
  const held = new Map(blocks.map((block) => [block.id, block]))
  const arranged: ReportBlock[] = order.flatMap((id, at) => {
    const block = held.get(id)
    return block === undefined ? [] : [{ ...block, position: at }]
  })
  const others = blocks.filter((block) => block.reportId !== first.id)

  return (
    <ReportWorkspace
      {...rest}
      blocks={[...arranged, ...others]}
      onReorder={(ids) => {
        setOrder(ids)
        onReorder?.(ids)
      }}
    />
  )
}

/**
 * The whole keyboard route, end to end: focus a grip, Enter, ArrowDown, Enter.
 */
export const Rearranged: Story = {
  name: 'Rearranged from the keyboard',
  render: (args) => <Rearranging {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const [moved, next] = firstBlocks
    await expect(moved).toBeDefined()
    await expect(next).toBeDefined()
    if (moved === undefined || next === undefined) return

    const before = firstBlocks.map((block) => block.id)
    // **Focused rather than clicked.** React Aria's drag button is
    // `pointer-events: none` by design - a pointer drags the row itself, and
    // the button is the keyboard and screen-reader route to the same thing.
    ;(await canvas.findByRole('button', { name: `Drag ${headingOf(moved)}` })).focus()
    await userEvent.keyboard('{Enter}')
    // The gaps are registered a turn after the pickup, and an arrow key
    // arriving first is swallowed: the drop then lands where the section
    // already was, announces *Drop complete* and reports nothing.
    await waitFor(async () => {
      await expect(document.activeElement?.getAttribute('aria-label') ?? '').toMatch(/^Insert /)
    })
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    // What left: the whole scope, once each, in the order dropped.
    await waitFor(async () => {
      await expect(args.onReorder).toHaveBeenCalledWith([before[1], before[0], ...before.slice(2)])
    })

    // And what the screen now shows, which is the half a spy cannot see.
    await waitFor(async () => {
      const grips = canvas.getAllByRole('button', { name: /^Drag / })
      await expect(grips[0]).toHaveAttribute('aria-label', `Drag ${headingOf(next)}`)
      await expect(grips[1]).toHaveAttribute('aria-label', `Drag ${headingOf(moved)}`)
    })
  },
}

/**
 * The grips at rest, one per section and named by the section.
 */
export const Grips: Story = {
  name: 'A grip on every section',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grips = await canvas.findAllByRole('button', { name: /^Drag / })
    await expect(grips).toHaveLength(firstBlocks.length)
    await expect(grips.map((grip) => grip.getAttribute('aria-label'))).toEqual(
      firstBlocks.map((block) => `Drag ${headingOf(block)}`),
    )
    for (const grip of grips) await expect(grip).not.toHaveAttribute('tabindex', '-1')
  },
}
