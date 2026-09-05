import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent } from 'storybook/test'

import { LibraryCollection, type LibraryRow } from '@/components/blocks/library-collection'

/**
 * One drop-in library, whole: a heading, a search once it holds enough to
 * need one, the table, and the way to add an entry.
 */
const meta = {
  title: 'Blocks/Table/Library collection',
  component: LibraryCollection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LibraryCollection>

export default meta
type Story = StoryObj<typeof meta>

const TEMPLATES: readonly LibraryRow[] = [
  { id: 'ransomware', name: 'ransomware', label: 'Ransomware', origin: 'built-in' },
  { id: 'bec', name: 'bec', label: 'Business email compromise', origin: 'built-in' },
  { id: 'meridian-retainer', name: 'meridian-retainer', label: 'Meridian retainer', origin: 'yours' },
]

/**
 * `n` snippets, the last of them the analyst's own.
 */
function snippets(count: number): LibraryRow[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `snippet-${String(at + 1)}`,
    name: `snippet-${String(at + 1)}`,
    label: `Snippet ${String(at + 1)}`,
    origin: at === count - 1 ? ('yours' as const) : ('built-in' as const),
  }))
}

/**
 * A library small enough to read at a glance.
 */
export const Templates: Story = {
  name: 'Case templates, closed to search',
  args: {
    title: 'Case templates',
    blurb: 'Checklists a new case can start from.',
    noun: 'template',
    entries: TEMPLATES,
    newLabel: 'New template',
  },
  play: async ({ canvas, step }) => {
    await step('three entries is under the search threshold', async () => {
      await expect(canvas.queryByRole('textbox', { name: 'Search templates' })).toBeNull()
    })
    await step('a built-in carries no bin, and the analyst`s own does', async () => {
      await expect(canvas.queryByRole('button', { name: 'Delete Ransomware' })).toBeNull()
      await expect(
        canvas.getByRole('button', { name: 'Delete Meridian retainer' }),
      ).toBeInTheDocument()
    })
    await step('a built-in can be copied', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'More for Ransomware' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    })
    await step('and the copy is the analyst`s own, under its own key', async () => {
      await expect(canvas.getByText('Ransomware (copy)')).toBeVisible()
      await expect(canvas.getByText('ransomware-copy')).toBeVisible()
    })
    await step('while the add door is drawn and refused, naming where it lives', async () => {
      await expect(
        canvas.getByRole('button', { name: 'New template \u2014 written in the library editor' }),
      ).toBeDisabled()
    })
  },
}

/**
 * One entry short of a search box.
 */
export const JustUnderTheThreshold: Story = {
  name: 'Eleven entries, still no search',
  args: {
    title: 'Snippets',
    blurb: 'Paragraphs to drop into a written section.',
    noun: 'snippet',
    group: 'Snippets',
    entries: snippets(11),
    newLabel: 'New snippet',
  },
  play: async ({ canvas, step }) => {
    await step('no search box is drawn', async () => {
      await expect(canvas.queryByRole('textbox', { name: 'Search snippets' })).toBeNull()
    })
    await step('and the count says how many there are', async () => {
      await expect(canvas.getByText('11 snippets')).toBeVisible()
    })
  },
}

/**
 * The first count that draws its own search, and what a search that matches
 * nothing offers.
 */
export const Searchable: Story = {
  name: 'Twelve entries, where the search appears',
  args: {
    title: 'Snippets',
    blurb: 'Paragraphs to drop into a written section.',
    noun: 'snippet',
    group: 'Snippets',
    entries: snippets(12),
    newLabel: 'New snippet',
  },
  play: async ({ canvas, step }) => {
    const search = canvas.getByRole('textbox', { name: 'Search snippets' })
    await step('a query narrows the table and the count says so', async () => {
      await userEvent.type(search, 'snippet 4')
      await expect(canvas.getByText('Snippet 4')).toBeVisible()
      await expect(canvas.queryByText('Snippet 5')).toBeNull()
      // The badge reports the narrowing against the whole, so a count on its
      // own can never be read as the library having shrunk.
      await expect(canvas.getByText('1 of 12 snippets')).toBeVisible()
    })
    await step('a query matching nothing names what was typed', async () => {
      await userEvent.clear(search)
      await userEvent.type(search, 'kerberoasting')
      await expect(canvas.getByText('Nothing matches')).toBeVisible()
      await expect(
        canvas.getByText('No snippet in this library matches "kerberoasting".'),
      ).toBeVisible()
    })
    await step('and offers the whole library back', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Show every snippet' }))
      await expect(canvas.getByText('Snippet 1')).toBeVisible()
      await expect(canvas.getByText('Snippet 12')).toBeVisible()
    })
  },
}

/**
 * A library the server will not let anything be added to.
 */
export const Closed: Story = {
  name: 'A library nothing can be added to',
  args: {
    title: 'Report layouts',
    blurb: 'The layouts a report can start from.',
    noun: 'layout',
    entries: [
      { id: 'full', name: 'full', label: 'Full report', origin: 'built-in' },
      { id: 'exec', name: 'exec', label: 'Executive summary', origin: 'built-in' },
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the rows are there', async () => {
      await expect(canvas.getByText('Executive summary')).toBeVisible()
    })
    await step('and no add control is drawn at all', async () => {
      await expect(canvas.queryByRole('button', { name: /^New / })).toBeNull()
    })
  },
}

/**
 * A library holding nothing.
 */
export const Empty: Story = {
  name: 'A library with nothing in it',
  args: {
    title: 'Reports',
    blurb: 'The layouts a report can start from.',
    noun: 'layout',
    entries: [],
  },
  play: async ({ canvas, step }) => {
    await step('the empty state names the kind that is missing', async () => {
      await expect(canvas.getByText('No layouts available')).toBeVisible()
    })
    await step('and offers nothing to clear, there being no query', async () => {
      await expect(canvas.queryByRole('button', { name: 'Show every layout' })).toBeNull()
    })
  },
}

/**
 * A library somebody has been adding to for a year, with the longest entry name
 * and key it holds.
 */
export const TooMany: Story = {
  name: 'Forty entries, one very long name',
  args: {
    title: 'Snippets',
    blurb: 'Paragraphs to drop into a written section.',
    noun: 'snippet',
    entries: [
      {
        id: 'long',
        name: 'initial-containment-statement-for-a-regulated-financial-tenant',
        label: 'Initial containment statement for a regulated financial tenant',
        origin: 'yours',
      },
      ...snippets(39),
    ],
    newLabel: 'New snippet',
  },
  play: async ({ canvas, step }) => {
    await step('the longest label is kept whole in a title', async () => {
      await expect(
        canvas.getByTitle('Initial containment statement for a regulated financial tenant'),
      ).toBeInTheDocument()
    })
    await step('and so is the key beside it, which is the other truncating column', async () => {
      await expect(
        canvas.getByTitle('initial-containment-statement-for-a-regulated-financial-tenant'),
      ).toBeInTheDocument()
    })
  },
}
