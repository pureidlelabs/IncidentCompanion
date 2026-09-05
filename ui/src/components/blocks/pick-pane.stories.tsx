import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, FolderOpen, ShieldAlert, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Badge } from '@/components/ui/badge'
import { PickPane, type PickRow } from '@/components/blocks/pick-pane'

/**
 * `PickPane` on the React Aria kit: the sticky search, the rows and their
 * tones, a row carrying extra, and what an empty search leaves.
 */
const meta = {
  title: 'Blocks/Layout/Pick pane',
  component: PickPane,
  parameters: { layout: 'padded' },
  args: {
    search: '',
    onSearch: () => undefined,
    searchLabel: 'Search report shapes',
    searchPlaceholder: 'Search shapes',
    legend: 'Report shape',
    value: 'full',
    onValueChange: () => undefined,
    rows: [],
  },
} satisfies Meta<typeof PickPane>

export default meta
type Story = StoryObj<typeof meta>

const SECTIONS = (
  <div className="flex flex-wrap gap-1">
    <Badge size="xs">Summary</Badge>
    <Badge size="xs">Timeline</Badge>
    <Badge size="xs">Findings</Badge>
  </div>
)

const ROWS: readonly PickRow[] = [
  {
    value: 'full',
    title: 'Full investigation',
    detail: 'Every section, in the order the investigation ran.',
    icon: FileText,
    extra: SECTIONS,
  },
  {
    value: 'exec',
    title: 'Executive summary',
    detail: 'The finding and the impact, on one page.',
    chip: 'Short',
    icon: Sparkles,
  },
  {
    value: 'breach',
    title: 'Breach notification',
    detail: 'The GDPR bands, the data categories, and who was told.',
    chip: 'Regulated',
    icon: ShieldAlert,
    tone: 'flag',
  },
  {
    value: 'blank',
    title: 'Blank report',
    detail: 'A title page and nothing else.',
    icon: FolderOpen,
    tone: 'quiet',
  },
]

/** The pane wired to its own state, so a story searches and picks as the app does. */
function Live({ initial = '' }: { initial?: string }) {
  const [search, setSearch] = useState(initial)
  const [value, setValue] = useState('full')
  const needle = search.trim().toLowerCase()
  const rows =
    needle === '' ? ROWS : ROWS.filter((row) => row.title.toLowerCase().includes(needle))
  return (
    <div className="flex max-h-[28rem] flex-col overflow-auto p-1">
      <PickPane
        search={search}
        onSearch={setSearch}
        searchLabel="Search report shapes"
        searchPlaceholder="Search shapes"
        legend="Report shape"
        rows={rows}
        value={value}
        onValueChange={setValue}
      />
    </div>
  )
}

/** Four shapes, one of them picked. */
export const Default: Story = {
  name: 'Rows and a choice',
  args: { rows: ROWS },
}

/** The three tones, chosen from what a row is. */
export const Tones: Story = {
  name: 'The three tile tones',
  args: {
    rows: ROWS.filter((row) => row.value !== 'exec'),
    value: 'breach',
  },
}

/** One row, which is what a rail's narrowest branch leaves. */
export const OneRow: Story = {
  name: 'One row',
  args: { rows: [ROWS[0]!], value: 'full' },
}

/** The search matched nothing, so the pane names it and offers the way out. */
export const NothingMatches: Story = {
  name: 'Nothing matches the search',
  args: { rows: [], search: 'ransom' },
}

/** Typing narrows the rows, and clearing the search brings them back. */
export const Searching: Story = {
  name: 'Searching, then clearing',
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByLabelText('Search report shapes')
    await userEvent.type(box, 'breach')
    await expect(canvas.getByText('Breach notification')).toBeVisible()
    await expect(canvas.queryByText('Blank report')).toBeNull()

    // Nothing matches, so the pane offers the only thing that can undo it.
    await userEvent.clear(box)
    await userEvent.type(box, 'ransom')
    await expect(canvas.getByText(/Nothing matches/)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Clear the search' }))
    await expect(canvas.getByText('Blank report')).toBeVisible()
  },
}

/** Pressing a row moves the choice, and the radio follows it. */
export const Picking: Story = {
  name: 'Picking a row',
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Executive summary'))
    await expect(canvas.getByRole('radio', { name: 'Executive summary' })).toBeChecked()
  },
}

/**
 * Forty shapes in a pane the height of a dialog.
 */
export const Dense: Story = {
  name: 'Forty shapes to choose from',
  args: {
    rows: Array.from({ length: 40 }, (_, at) => ({
      ...ROWS[at % ROWS.length]!,
      value: `bulk-${String(at)}`,
      title: `Shape ${String(at + 1)}`,
    })),
    value: 'bulk-0',
  },
  render: (args) => (
    <div className="flex h-[24rem] flex-col overflow-auto p-1">
      <PickPane {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('radio')).toHaveLength(40)

    // The search is inside the scrolling pane, so it is the one control that
    // has to survive the rows being longer than the box.
    await expect(canvas.getByLabelText('Search report shapes')).toBeVisible()
    await expect(canvas.getByRole('radio', { name: /Shape 40/ })).toBeInTheDocument()
  },
}
