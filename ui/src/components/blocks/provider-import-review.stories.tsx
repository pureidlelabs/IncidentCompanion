import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'

import {
  ProviderImportReview,
  type Candidate,
} from '@/components/blocks/provider-import-review'

/** Six rows from two incidents, four new and two merges. */
const CANDIDATES: readonly Candidate[] = [
  { id: 'c1', incident: 'INC-88214', collection: 'timeline', label: 'Ransomware deployment detected on multiple hosts', verdict: 'new', fields: 7, checked: true },
  { id: 'c2', incident: 'INC-88214', collection: 'systems', label: 'DC-01', verdict: 'merge', fields: 3, checked: true },
  { id: 'c3', incident: 'INC-88214', collection: 'systems', label: 'FS-02', verdict: 'new', fields: 5, checked: true },
  { id: 'c4', incident: 'INC-88214', collection: 'accounts', label: 'svc-backup', verdict: 'merge', fields: 2, checked: true },
  { id: 'c5', incident: 'INC-88155', collection: 'timeline', label: 'Mass file rename by a single account', verdict: 'new', fields: 6, checked: true },
  { id: 'c6', incident: 'INC-88155', collection: 'network_indicators', label: '203.0.113.44', verdict: 'new', fields: 4, checked: true },
]

/**
 * The importer's review step: every row the import would write, each one
 * approvable on its own, with `new` and `merge` as a chip on the row.
 *
 * What it owes a reader is the shape of the write before it happens: which
 * incident each row came from, which table it lands in, whether it adds or
 * changes something -- and, since a tick is what gets written, which rows are
 * going in.
 */
const meta = {
  title: 'Blocks/Table/Provider import review',
  component: ProviderImportReview,
  parameters: { layout: 'padded' },
  args: { candidates: CANDIDATES, onApproved: () => undefined },
} satisfies Meta<typeof ProviderImportReview>

export default meta
type Story = StoryObj<typeof meta>

/** A row's own box is named for the row; the header's is `Select every row`. */
const ROW_BOX = /^Import /

/**
 * Two incidents, four writes and two changes, all of them proposed.
 *
 * The summary above the table is a live region: the step is reached by pressing
 * a button elsewhere, so somebody not looking at this pane is told what it
 * found and how much of it is going in.
 */
export const Default: Story = {
  name: 'Six rows from two incidents',
  play: async ({ canvas, step }) => {
    await step('the summary counts both verdicts and the incidents behind them', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        '4 new rows and 2 merges, from 2 incidents.',
      )
    })
    await step('every proposed row is on the table, one to a line', async () => {
      await expect(canvas.getAllByRole('checkbox', { name: ROW_BOX })).toHaveLength(6)
    })
    await step('and all six are approved, because the server proposed all six', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent('6 rows approved.')
    })
  },
}

/**
 * The analyst declines a row, which is the whole point of the step.
 *
 * `An analyst declines part of an import` -- the rest of the import survives
 * it, so the count falls by one rather than the step resetting.
 */
export const OneDeclined: Story = {
  name: 'One row declined',
  play: async ({ canvas, step }) => {
    await step('the analyst unticks the row they do not want', async () => {
      await userEvent.click(canvas.getByRole('checkbox', { name: 'Import DC-01' }))
    })
    await step('the count falls by one and the rest of the import stands', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent('5 rows approved.')
      await expect(canvas.getAllByRole('checkbox', { name: ROW_BOX })).toHaveLength(6)
    })
  },
}

/**
 * The server proposed only some of what it found.
 *
 * A row the case already holds and a network indicator on a private address
 * both arrive unticked, and the review starts where the server left it rather
 * than ticking everything and making the analyst find them.
 */
export const PartlyProposed: Story = {
  name: 'Two rows the server did not propose',
  args: {
    candidates: CANDIDATES.map((one) =>
      one.verdict === 'merge' ? { ...one, checked: false } : one,
    ),
  },
  play: async ({ canvas, step }) => {
    await step('the table still shows every row it found', async () => {
      await expect(canvas.getAllByRole('checkbox', { name: ROW_BOX })).toHaveLength(6)
    })
    await step('and only the four it proposed are approved', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent('4 rows approved.')
    })
  },
}

/**
 * The smallest import that is not nothing: one incident, one row.
 *
 * Every noun in the summary inflects. The line is announced rather than read,
 * so `1 new rows and 0 merges, from 1 incidents` is what a screen reader says
 * out loud -- which is where the interface stops sounding like it was written
 * by the thing it is describing.
 */
export const OneOfEach: Story = {
  name: 'One row from one incident',
  args: {
    candidates: [
      {
        id: 'c1',
        incident: 'INC-88214',
        collection: 'systems',
        label: 'DC-01',
        verdict: 'new',
        fields: 3,
        checked: true,
      },
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the summary is written in the singular throughout', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        '1 new row and 0 merges, from 1 incident. 1 row approved.',
      )
    })
  },
}

/**
 * An import that changes rows the case already holds and adds none.
 *
 * The distinction is the whole of what a reviewer is deciding, so the chip is
 * on every row rather than a count at the top -- a summary saying six merges
 * does not say which six.
 */
export const AllMerges: Story = {
  name: 'Nothing new, three changes',
  args: {
    candidates: CANDIDATES.slice(0, 3).map((one) => ({ ...one, verdict: 'merge' as const })),
  },
  play: async ({ canvas, step }) => {
    await step('the summary reports no writes', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        '0 new rows and 3 merges, from 1 incident.',
      )
    })
    await step('and each row carries the verdict, not just the total', async () => {
      await expect(canvas.getAllByText('merge')).toHaveLength(3)
      await expect(canvas.queryByText('new')).toBeNull()
    })
  },
}

/**
 * The incidents carry nothing the case does not already hold.
 *
 * A successful import that writes nothing looks like a failure unless it says
 * otherwise, so the empty state names the reason rather than the absence.
 */
export const NothingToAdd: Story = {
  name: 'Nothing to add',
  args: { candidates: [] },
  play: async ({ canvas, step }) => {
    await step('the empty state says why there is nothing', async () => {
      await expect(canvas.getByText('Nothing to add')).toBeVisible()
      await expect(
        canvas.getByText('Every row these incidents carry is already in the case, unchanged.'),
      ).toBeVisible()
    })
    await step('and no summary is drawn, there being nothing to count', async () => {
      await expect(canvas.queryByRole('status')).toBeNull()
    })
  },
}

/**
 * A month of incidents pulled in at once, with the longest label among them.
 *
 * The label is the only part of a row that gives, so it truncates and carries
 * its own `title`; the table chip, the field count and the verdict all keep
 * their width, because those are what the review is scanned down.
 */
export const TooMany: Story = {
  name: 'Ninety-one rows from thirteen incidents',
  args: {
    candidates: [
      {
        id: 'long',
        incident: 'INC-88214',
        collection: 'timeline',
        label:
          'Encryption of the finance file share observed from DC-01 by svc-backup, after the same account cleared the Windows security log on four hosts',
        verdict: 'new',
        fields: 11,
        checked: true,
      },
      ...Array.from({ length: 90 }, (_, at) => ({
        id: `bulk-${String(at)}`,
        incident: `INC-88${String(100 + (at % 12))}`,
        collection: ['timeline', 'systems', 'accounts', 'network_indicators'][at % 4] ?? 'timeline',
        label: `Row ${String(at + 1)}`,
        verdict: at % 3 === 0 ? ('merge' as const) : ('new' as const),
        fields: (at % 9) + 1,
        checked: true,
      })),
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the long label is kept whole in a title', async () => {
      await expect(
        canvas.getByTitle(
          'Encryption of the finance file share observed from DC-01 by svc-backup, after the same account cleared the Windows security log on four hosts',
        ),
      ).toBeInTheDocument()
    })
    await step('and the summary still counts the whole of it', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        '61 new rows and 30 merges, from 13 incidents.',
      )
    })
  },
}
