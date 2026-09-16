import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { batchDoorsFixture } from '@/fixtures/batch-doors'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { ImportDataScreen } from './import-data'
import { inACase } from '@/fixtures/in-a-case'

/** A case with every table empty, which is what an import screen is opened on. */
const BLANK: Case = {
  ...campaignCase,
  timeline: [],
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  impact: [],
  actions: [],
  casenotes: [],
}

/**
 * Every table the batch doors write to, in one place.
 *
 * The rows are what the server marks batch-creatable, so the three it excludes
 * - evidence and the two report tables - are absent rather than greyed.
 */
const meta = {
  title: 'Screens/Collect/Import data',
  component: ImportDataScreen,
  decorators: [inACase('import')],
  parameters: { layout: 'fullscreen' },
  args: {
    kase: campaignCase,
    specs: specsFixture,
    collections: batchDoorsFixture,
  },
} satisfies Meta<typeof ImportDataScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The campaign demo: nine tables, each with the rows it already holds. */
export const Populated: Story = { name: 'Ten importable tables' }

/**
 * A case nobody has imported into yet, which is when this screen is opened.
 *
 * Every count is zero and every control is still offered: an empty table is
 * exactly the one somebody is about to fill.
 */
export const EmptyCase: Story = {
  name: 'A case with nothing imported yet',
  args: { kase: BLANK },
}

/** An import that landed whole. */
export const Imported: Story = {
  name: 'An import that landed',
  args: {
    result: {
      collection: 'systems',
      written: 30,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 0,
      unlinkedBy: {},
    },
  },
  play: async ({ canvas, step }) => {
    await step('it says how many landed and where', async () => {
      await expect(canvas.getByText(/30 rows imported into/)).toBeVisible()
    })
    await step('and nothing is reported refused', async () => {
      await expect(canvas.queryByText(/refused/)).toBeNull()
    })
    await step('and it says plainly that the references came with it', async () => {
      await expect(canvas.getByText(/Every reference was carried/)).toBeVisible()
    })
  },
}

/**
 * An import that landed whole and arrived less connected than its file.
 *
 * **The state the silence hid.** A reference travels as what it points at, and
 * the destination case may not hold that thing -- so the row lands without the
 * link. Nothing is refused and nothing is wrong with the file; what an analyst
 * needs is the count and the kind, so they know what to bring across next.
 * -> #51
 */
export const ReferencesLost: Story = {
  name: 'An import whose references did not all resolve',
  args: {
    result: {
      collection: 'impact',
      written: 18,
      skipped: 0,
      replaced: 0,
      refused: 0,
      unlinked: 5,
      unlinkedBy: { systems: 3, methods: 2 },
    },
  },
  play: async ({ canvas, step }) => {
    await step('it still reports the rows as landed', async () => {
      await expect(canvas.getByText(/18 rows imported into/)).toBeVisible()
    })
    await step('it names how many references were lost, and to what', async () => {
      await expect(canvas.getByText(/5 references could not be carried/)).toBeVisible()
      await expect(canvas.getByText(/3 to Assets/)).toBeVisible()
      await expect(canvas.getByText(/2 to Methods/)).toBeVisible()
    })
    await step('and calls none of it a refusal', async () => {
      await expect(canvas.queryByText(/refused/)).toBeNull()
    })
  },
}

/**
 * An import the server took in part.
 *
 * The refusals stay on this screen, beside the row they were sent from: a
 * refused row is the one thing an analyst has to act on afterwards.
 */
export const RowsRefused: Story = {
  name: 'Rows the server refused',
  args: {
    result: {
      collection: 'network_indicators',
      written: 14,
      skipped: 0,
      replaced: 0,
      refused: 3,
      unlinked: 0,
      unlinkedBy: {},
    },
  },
  play: async ({ canvas, step }) => {
    await step('it reports both halves, not just the failure', async () => {
      // Fourteen rows are in the case. Reporting only the refusals would have
      // an analyst re-import a file that mostly landed.
      await expect(canvas.getByText('14 rows imported, 3 refused')).toBeVisible()
      // And only that: the whole-import banner alongside it would say the file
      // landed, which is the half an analyst would stop reading at.
      await expect(canvas.queryByText(/rows imported into/)).toBeNull()
    })
  },
}

/**
 * A file imported a second time, every row of which the case already holds.
 *
 * **The state the two missing counts hid.** Without them this reads `0 rows
 * imported` and nothing else, which is an import that did nothing rather than
 * one that found every row already present. -> #793
 */
export const AlreadyThere: Story = {
  name: 'A file the case already holds',
  args: {
    result: {
      collection: 'systems',
      written: 0,
      skipped: 28,
      replaced: 4,
      refused: 0,
      unlinked: 0,
      unlinkedBy: {},
    },
  },
  play: async ({ canvas, step }) => {
    await step('it says how many were already there and how many it replaced', async () => {
      await expect(canvas.getByText(/28 already there, 4 replaced/)).toBeVisible()
    })
    await step('and does not headline it as an import that did nothing', async () => {
      await expect(canvas.getByText('Nothing new in Assets')).toBeVisible()
    })
  },
}

/**
 * An install offering no batch door at all.
 *
 * The screen says so rather than drawing an empty frame, because an empty frame
 * and a screen that failed to load look the same.
 */
export const NoTables: Story = {
  name: 'An install with no batch door',
  args: { collections: [] },
  play: async ({ canvas, step }) => {
    await step('the screen says so rather than drawing an empty frame', async () => {
      // An empty frame and a screen that failed to load look the same, so the
      // absence is named rather than left to be inferred.
      await expect(canvas.getByText('No importable tables')).toBeVisible()
      await expect(canvas.getByText('This install offers no batch door yet.')).toBeVisible()
    })
  },
}

/**
 * A 420px pane.
 *
 * The row's actions wrap under its title rather than pushing the count off the
 * end.
 */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <ImportDataScreen {...args} />
    </div>
  ),
}

/**
 * A result strip long enough to wrap: every count non-zero, and four kinds
 * lost.
 *
 * In `Narrow`'s frame, so the wrap is the strip's rather than the canvas's.
 */
export const Overlong: Story = {
  name: 'A result too long for one line',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <ImportDataScreen {...args} />
    </div>
  ),
  args: {
    result: {
      collection: 'timeline',
      written: 132,
      skipped: 47,
      replaced: 19,
      refused: 6,
      unlinked: 24,
      unlinkedBy: { systems: 11, accounts: 7, methods: 4, network_indicators: 2 },
    },
  },
}

/**
 * The two controls a table row carries, pressed.
 *
 * A template is the served columns and leaves from the browser; an import
 * writes rows and is the server's, so it is drawn refused. Both halves are
 * asserted, because "drawn refused" is a claim that goes stale the moment
 * somebody wires it up.
 */
export const Doors: Story = {
  name: 'A template, and a refused import',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const template = (await canvas.findAllByRole('link', { name: /Template/ }))[0]!
    await expect(template.getAttribute('href')).toMatch(/^data:text\/csv/)
    await expect(canvas.getAllByRole('button', { name: /Import CSV/ })[0]!).toBeDisabled()
  },
}
