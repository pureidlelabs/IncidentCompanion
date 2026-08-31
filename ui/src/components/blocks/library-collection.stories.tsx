import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent } from 'storybook/test'

import { LibraryCollection, type LibraryRow } from '@/components/blocks/library-collection'

/**
 * One drop-in library, whole: a heading, a search once it holds enough to
 * need one, the table, and the way to add an entry.
 *
 * The picker's three library panes - case templates, report layouts,
 * snippets - differ only in the words and in whether `newLabel` is given, so
 * they compose onto this rather than each drawing the same table by hand. Every
 * story below is one of those three panes as the screen would pass it.
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
 *
 * The key carries the same number as the label. Offsetting the two by one makes
 * every search for a number match two rows, which would be a property of the
 * fixture rather than of the search.
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
 *
 * Three entries, two of them shipped with the image. A built-in can be copied
 * and never removed, so the row says so by carrying no bin rather than by
 * drawing one that refuses -- and the copy it makes is the analyst's own,
 * which is the whole point of the verb.
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
 *
 * The threshold is twelve, and eleven is the story that pins it: a library
 * drawing its search at any count would pass the story below on its own, so
 * only the pair says where the boundary falls.
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
 *
 * The empty result is a dead end unless it carries the way out, so it names the
 * query that produced it and offers the whole library back -- an analyst who
 * typed into a box they did not know was there needs the second more than the
 * first.
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
 *
 * `newLabel` absent draws no add control at all. A door that opens onto a
 * refusal is worse than no door, and the library editor is where an entry is
 * actually written -- this pane never had a route to it.
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
 *
 * Distinct from a search matching nothing, which the story above draws: this
 * one has no query to clear and no way out, so it states the absence and stops.
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
 *
 * Both text columns truncate and carry their own `title`, so a name too long
 * for its column stays reachable rather than being lost.
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
