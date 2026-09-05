import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import type { Case } from '@/api/model'
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
  args: { result: { collection: 'systems', written: 30, refused: 0 } },
  play: async ({ canvas, step }) => {
    await step('it says how many landed and where', async () => {
      await expect(canvas.getByText(/30 rows imported into/)).toBeVisible()
    })
    await step('and nothing is reported refused', async () => {
      await expect(canvas.queryByText(/refused/)).toBeNull()
    })
  },
}

/**
 * An import the server took in part.
 *
 * The refusals are on this screen rather than in the dialog that sent them: the
 * dialog is gone by the time the server answers, and a refused row is the one
 * thing an analyst has to act on afterwards.
 */
export const RowsRefused: Story = {
  name: 'Rows the server refused',
  args: {
    result: {
      collection: 'network_indicators',
      written: 14,
      refused: 3,
      refusals: [
        { row: 4, detail: 'value is not an address, a domain or a URL' },
        { row: 9, detail: 'disposition is not one of benign, suspicious, malicious' },
        { row: 17, detail: 'firstSeen is not a time' },
      ],
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
    await step('and each refusal names its line and its reason', async () => {
      // A refused row is the one thing to act on afterwards, and the dialog
      // that sent it is gone by the time the server answers.
      await expect(canvas.getByText(/value is not an address/)).toBeVisible()
      await expect(canvas.getByText(/firstSeen is not a time/)).toBeVisible()
    })
  },
}

/**
 * What the route actually answers: a count of refusals and no line numbers.
 *
 * **The shape the container can fill.** `POST /cases/{id}/{collection}.csv`
 * returns `{ added, skipped, replaced, refused }`, all numbers, so a screen
 * that can only report refusals it has line numbers for reports none of them
 * -- and the analyst reads an unqualified success over a file the server took
 * in part. The count is what has to be true; the lines are detail this route
 * does not carry yet.
 */
export const RefusedWithoutDetail: Story = {
  name: 'Rows refused, with only a count to say so',
  args: {
    result: { collection: 'network_indicators', written: 14, refused: 3 },
  },
  play: async ({ canvas, step }) => {
    await step('it still says how many were refused', async () => {
      await expect(canvas.getByText('14 rows imported, 3 refused')).toBeVisible()
    })
    await step('and does not report the import as whole', async () => {
      // The half an analyst stops reading at. A file the server took in part
      // reported as landed is worse than one reported as failed.
      await expect(canvas.queryByText(/rows imported into/)).toBeNull()
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

/** A refusal long enough to wrap inside its own line. */
export const Overlong: Story = {
  name: 'A refusal too long for one line',
  args: {
    result: {
      collection: 'timeline',
      written: 0,
      refused: 1,
      refusals: [
        {
          row: 2,
          detail:
            'systemId points at a row in another case, and a reference may not cross the case boundary - re-export the template from this case and map the column again',
        },
      ],
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
