import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import {
  ProviderImportReview,
  type Candidate,
} from '@/components/blocks/provider-import-review'

/** Six rows from two incidents, four new and two merges. */
const CANDIDATES: readonly Candidate[] = [
  { id: 'c1', incident: 'INC-88214', collection: 'Timeline', label: 'Ransomware deployment detected on multiple hosts', verdict: 'new', fields: 7 },
  { id: 'c2', incident: 'INC-88214', collection: 'Assets', label: 'DC-01', verdict: 'merge', fields: 3 },
  { id: 'c3', incident: 'INC-88214', collection: 'Assets', label: 'FS-02', verdict: 'new', fields: 5 },
  { id: 'c4', incident: 'INC-88214', collection: 'Accounts', label: 'svc-backup', verdict: 'merge', fields: 2 },
  { id: 'c5', incident: 'INC-88155', collection: 'Timeline', label: 'Mass file rename by a single account', verdict: 'new', fields: 6 },
  { id: 'c6', incident: 'INC-88155', collection: 'Network', label: '203.0.113.44', verdict: 'new', fields: 4 },
]

/**
 * The importer's review step: what would be written, grouped by the
 * incident it came from, with `new` and `merge` as a chip on every row.
 */
const meta = {
  title: 'Blocks/Table/Provider import review',
  component: ProviderImportReview,
  parameters: { layout: 'padded' },
  args: { candidates: CANDIDATES },
} satisfies Meta<typeof ProviderImportReview>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Two incidents, four writes and two changes.
 */
export const Default: Story = {
  name: 'Six rows from two incidents',
  play: async ({ canvas, step }) => {
    await step('the summary counts both verdicts and the incidents behind them', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        '4 new rows and 2 merges, from 2 incidents.',
      )
    })
    await step('the incidents keep the order they arrived in', async () => {
      const headings = canvas.getAllByRole('heading', { level: 3 })
      await expect(headings.map((one) => one.textContent)).toEqual(['INC-88214', 'INC-88155'])
    })
    await step('and each incident owns the rows that came from it', async () => {
      const lists = canvas.getAllByRole('list')
      await expect(lists).toHaveLength(2)
      await expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(4)
      await expect(within(lists[0]!).getByText('Accounts')).toBeVisible()
      await expect(within(lists[1]!).getAllByRole('listitem')).toHaveLength(2)
    })
  },
}

/**
 * The smallest import that is not nothing: one incident, one row.
 */
export const OneOfEach: Story = {
  name: 'One row from one incident',
  args: {
    candidates: [
      {
        id: 'c1',
        incident: 'INC-88214',
        collection: 'Assets',
        label: 'DC-01',
        verdict: 'new',
        fields: 3,
      },
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the summary is written in the singular throughout', async () => {
      await expect(canvas.getByRole('status')).toHaveTextContent(
        '1 new row and 0 merges, from 1 incident.',
      )
    })
  },
}

/**
 * An import that changes rows the case already holds and adds none.
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
 */
export const TooMany: Story = {
  name: 'Ninety-one rows from thirteen incidents',
  args: {
    candidates: [
      {
        id: 'long',
        incident: 'INC-88214',
        collection: 'Timeline',
        label:
          'Encryption of the finance file share observed from DC-01 by svc-backup, after the same account cleared the Windows security log on four hosts',
        verdict: 'new',
        fields: 11,
      },
      ...Array.from({ length: 90 }, (_, at) => ({
        id: `bulk-${String(at)}`,
        incident: `INC-88${String(100 + (at % 12))}`,
        collection: ['Timeline', 'Assets', 'Accounts', 'Network'][at % 4] ?? 'Timeline',
        label: `Row ${String(at + 1)}`,
        verdict: at % 3 === 0 ? ('merge' as const) : ('new' as const),
        fields: (at % 9) + 1,
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
