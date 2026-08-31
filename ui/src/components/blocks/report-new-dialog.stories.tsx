import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { DEMO_TLP } from './report-layouts'

import { Button } from '@/components/ui/button'
import { bareInACase } from '@/fixtures/in-a-case'

import { DEMO_LAYOUTS } from './report-layouts'
import { ReportNewDialog, summarise } from './report-new-dialog'

/**
 * Starting a report: the shape it begins as, and the three facts that go on the
 * document.
 *
 * A card carries a chip per section, so the choice is made from what the report
 * will contain rather than from a name.
 */
const meta = {
  title: 'Blocks/Overlay/New report',
  component: ReportNewDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    layouts: DEMO_LAYOUTS,
    markings: DEMO_TLP,
    // Shut by default, and a story turns it on: a docs page renders every
    // story into one document, and five modal dialogs there cannot be
    // dismissed.
    open: false,
    onOpenChange: () => undefined,
  },
  decorators: [
    /**
     * Holds the dialog open, which nothing else here does.
     *
     * `open` is a controlled prop and the args set it `false`, so a story
     * asking for `startOpen` got a parameter nobody read and a canvas holding
     * the case shell alone. Every `play` below then searched a dialog that was
     * never on the page, and the two that assert an *absence* passed for the
     * wrong reason.
     */
    (Story, context) => {
      const [open, setOpen] = useState(context.parameters.startOpen === true)
      return (
        <>
          <Button
            variant="outline"
            onPress={() => {
              setOpen(true)
            }}
          >
            New report
          </Button>
          <Story args={{ ...context.args, open, onOpenChange: setOpen }} />
        </>
      )
    },
    bareInACase,
  ],
} satisfies Meta<typeof ReportNewDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Open on mount, in its own docs frame `height` tall. */
function openInFrame(height: string) {
  return { startOpen: true, docs: { story: { inline: false, height } } }
}

/**
 * Every shape this install ships: three case reports and the four Article 23
 * filings, split by the rail.
 */
export const Populated: Story = {
  name: 'Every shape offered',
  parameters: openInFrame('820px'),
}

/**
 * The regime off: no filing is offered, so the rail has nothing to narrow and
 * draws one row.
 *
 * A rail whose every row but one is empty is a control that narrows nothing.
 */
export const NoRegime: Story = {
  name: 'An install with no regime',
  args: { nis2Enabled: false },
  parameters: openInFrame('820px'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await expect(canvas.queryByText('Regulatory filings')).toBeNull()
  },
}

/**
 * A filing picked. The stage is the layout, so nothing asks for it a second
 * time -- what this holds is that picking one still names it on the document.
 */
export const Filing: Story = {
  name: 'A filing, which has a stage',
  parameters: openInFrame('820px'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    const filing = DEMO_LAYOUTS.find((one) => one.nis2)
    await expect(filing).toBeDefined()
    if (filing === undefined) return
    await userEvent.click(await canvas.findByText(filing.label))
    // `waitFor` around the whole assertion rather than `findBy` and then a
    // check: the pick re-renders the band, so a node found in one render is
    // detached by the time it is asked whether it is visible.
    await waitFor(async () => {
      await expect(canvas.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
        'placeholder',
        filing.label,
      )
    })
  },
}

/**
 * The shape that seeds nothing, which carries no chips and says so where the
 * others say how many sections.
 */
export const SeedsNothing: Story = {
  name: 'Starting from nothing',
  parameters: openInFrame('820px'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    const blank = DEMO_LAYOUTS.find((one) => one.blocks.length === 0)
    await expect(blank).toBeDefined()
    if (blank === undefined) return
    await userEvent.click(await canvas.findByText(blank.label))
    await waitFor(async () => {
      await expect(canvas.getByText(summarise(blank))).toBeVisible()
    })
  },
}

/** A search matching nothing: it names what was searched for and offers the way back. */
export const NoMatch: Story = {
  name: 'A search that matches nothing',
  parameters: openInFrame('820px'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.type(
      await canvas.findByLabelText('Search the report shapes'),
      'no layout says this',
    )
    await expect(await canvas.findByText('Clear the search')).toBeVisible()
  },
}

/**
 * One layout, dropped in and carrying no summary: the card is a title and its
 * chips, and the rail does not split.
 */
export const OneDroppedIn: Story = {
  name: 'One dropped-in shape',
  args: {
    layouts: [
      {
        name: 'house-style',
        label: 'House style',
        summary: '',
        builtin: false,
        nis2: false,
        blocks: [
          { kind: 'case_header', position: 0, heading: '', headingKey: '', label: 'Case' },
          { kind: 'written', position: 1, heading: 'Wat er gebeurd is', headingKey: '',
            label: 'Wat er gebeurd is' },
        ],
      },
    ],
  },
  parameters: openInFrame('820px'),
}

/** Nothing offered at all, which is an install whose registry is empty. */
export const Nothing: Story = {
  name: 'No shapes at all',
  args: { layouts: [] },
  parameters: openInFrame('820px'),
}

/**
 * An install that has dropped in five shapes for every one it ships.
 *
 * The picker is a grid inside a dialog, so this is where it has to scroll under
 * the search box rather than pushing the action row off the bottom.
 */
export const Dense: Story = {
  name: 'A registry of forty shapes',
  args: { layouts: manyLayouts() },
  parameters: openInFrame('820px'),
  // A picker that drew what fitted and clipped the rest reads as a shorter
  // registry rather than as a scroller nobody wired up.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await expect((await canvas.findAllByText(/\(house 5\)/)).length).toBeGreaterThan(0)
  },
}

/** The shipped shapes six times over, each pass named for its own house. */
function manyLayouts() {
  return [0, 1, 2, 3, 4, 5].flatMap((pass) =>
    DEMO_LAYOUTS.map((layout) => ({
      ...layout,
      name: `${layout.name}-${String(pass)}`,
      label: pass === 0 ? layout.label : `${layout.label} (house ${String(pass)})`,
      builtin: pass === 0,
    })),
  )
}

