import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { Case, SystemEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { bareInACase } from '@/fixtures/in-a-case'
import { specsFixture } from '@/fixtures/specs'

import { EMPTY_CASE } from './entity-scope'
import { EntityScopeTable, type EntityWrites } from './entity-scope-table'

/**
 * The entity family's one shape: a scope row, a search box, a filter bar and a
 * table under them.
 *
 * Six sections are this block at a different `scope`. The chrome above the
 * table is the same elements at the same pixels at every scope, so pressing a
 * kind changes the body and nothing else. The counts on the row answer the
 * search per kind, at every scope.
 *
 * Unscoped the table is the five columns every kind projects onto. Scoped it is
 * that kind's own columns, its own bulk fields and its own add door.
 */
const meta = {
  title: 'Blocks/Table/Entity scope table',
  component: EntityScopeTable,
  parameters: { layout: 'fullscreen' },
  args: { kase: campaignCase, specs: specsFixture },
  decorators: [bareInACase],
} satisfies Meta<typeof EntityScopeTable>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every kind at once, on the five columns they all project onto.
 *
 * **The State column is a word each kind chooses, never a raw stored value.**
 * An account's `disabled` is a boolean, and `false` in a state column reads as
 * a verdict rather than as an account that is working -- so the projection
 * answers `disabled` or `active`, and the column paints from no tone map
 * because neither is a judgement.
 */
export const Unscoped: Story = {
  name: 'Every kind at once',
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('an account`s state is a word rather than the boolean behind it', async () => {
      await expect(canvas.getAllByText(/^(disabled|active)$/).length).toBeGreaterThan(0)
      await expect(canvas.queryByText(/^(true|false)$/)).toBeNull()
    })
  },
}

/**
 * The same block, opened on one kind.
 *
 * The row above, the search box and the filter bar are unchanged; the table is
 * the systems form's own columns, and the head has gained an add door because
 * one kind has one form.
 */
export const Scoped: Story = {
  name: 'Opened on one kind',
  args: { scope: 'assets' },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)

    // **A tablist rather than a nav.** The row narrows the table below it
    // rather than navigating, and the kit's tabs are what carry the travelling
    // underline, the rail beneath the row and a focus ring sized for a tab --
    // none of which a row of buttons drawing its own border has.
    await step('the scope row is the kit`s tabs', async () => {
      await expect(canvas.getByRole('tablist', { name: 'Scope' })).toBeInTheDocument()
      await expect(canvas.getByRole('tab', { name: /^Assets/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(canvas.getByRole('tab', { name: /^All entities/ })).toHaveAttribute(
        'aria-selected',
        'false',
      )
    })

    await step('and the kind still has its own add door', async () => {
      await expect(canvas.getByRole('button', { name: 'Add asset' })).toBeInTheDocument()
    })

    /**
     * **Arrowing moves the focus and commits nothing.** React Aria's default is
     * `automatic`, which selects on focus -- and with one tab stop for the
     * whole list, that makes the last kind reachable only by loading every kind
     * between. The table below is what says whether a scope was committed, so
     * it is what is read rather than the tab's own attribute.
     */
    await step('arrowing through the kinds does not re-scope the table', async () => {
      const selected = canvas.getByRole('tab', { name: /^Assets/ })
      selected.focus()
      await userEvent.keyboard('{ArrowRight}')
      await userEvent.keyboard('{ArrowRight}')

      await expect(canvas.getByRole('tab', { name: /^Assets/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(canvas.getByRole('button', { name: 'Add asset' })).toBeInTheDocument()
    })
  },
}

/**
 * The row at a pane too narrow to hold it.
 *
 * **Six kinds need 622px, and the kit's tab list scrolls sideways.** A kind
 * pushed off the end of a scrolling row is hidden behind a gesture with nothing
 * on screen to say it is there, which is the case `FilterBar`'s own story
 * settles the same way: the cost of wrapping is height, which a row can afford,
 * and a hidden value cannot.
 *
 * Neither unit tier can see this -- jsdom gives every element a zero box, so a
 * row that wraps and a row that clips measure identically.
 */
export const NarrowScopeRow: Story = {
  name: 'A pane too narrow for the kinds',
  args: { scope: 'assets' },
  render: (args) => (
    <div className="w-[500px] border border-dashed border-border">
      <EntityScopeTable {...args} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    await step('every kind stays on screen, on as many lines as it takes', async () => {
      const list = canvasElement.querySelector('[role="tablist"]')
      if (!(list instanceof HTMLElement)) throw new Error('the row drew no tablist')

      await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)

      const box = list.getBoundingClientRect()
      for (const tab of canvasElement.querySelectorAll('[role="tab"]')) {
        const own = tab.getBoundingClientRect()
        await expect(
          Math.round(own.right) <= Math.round(box.right) + 1,
          `${tab.textContent} is cut off the end of the row`,
        ).toBe(true)
      }
    })
  },
}

/**
 * A search that matches in a kind other than the one on screen.
 *
 * The scope row keeps counting every kind, so the string is findable from
 * whichever scope the analyst happened to be on.
 */
export const SearchedAcrossKinds: Story = {
  name: 'A string that lives in another kind',
  args: { scope: 'malware', search: 'svc-' },
}

/** No rows in any collection: the offers are the kinds to start from. */
export const Empty: Story = {
  name: 'A case with nothing in it',
  args: { kase: EMPTY_CASE },
}

/**
 * A verdict cell carrying both of its badges, in a column too narrow for them
 * side by side.
 *
 * **`isolated` sits beside the verdict on purpose** -- a compromised host taken
 * off the network is only readable next to the verdict that says it was
 * compromised -- and the pair needs 155px. The column is `w-[15%]`, which is
 * 209px at 1440 and 111px by 900px, so the pair spilled 58px into the
 * neighbouring column with `overflow-x: visible` to carry it there. The first
 * pane width it spills at is about 1215px.
 *
 * **The sweep reports it and this fails on it**, which is the split those two
 * tiers keep everywhere: the walk is an oracle a person reads, and a number
 * nobody is obliged to act on is one that drifts back.
 */
export const NarrowVerdictColumn: Story = {
  name: 'A verdict column too narrow for both badges',
  args: { scope: 'assets' },
  render: (args) => (
    <div className="w-[900px] border border-dashed border-border">
      <EntityScopeTable {...args} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    await step('the pair stays inside its own cell', async () => {
      const badge = [...canvasElement.querySelectorAll('span')].find(
        (el) => el.textContent.trim() === 'isolated',
      )
      // A fixture with no isolated row would satisfy any statement about the
      // badge's box by never making one.
      const pair = badge?.parentElement
      if (!(pair instanceof HTMLElement)) {
        throw new Error('no row in the fixture carries an isolated badge')
      }
      const cell = pair.closest('td, [role="gridcell"]')
      if (!(cell instanceof HTMLElement)) throw new Error('the badge sits in no cell')

      // **Against the content edge, not the border edge.** The cell carries
      // `px-3`, so a border-box reading passes a badge sitting 12px into the
      // padding -- which is 12px of the gap that keeps this column off the
      // next one, spent without the assertion noticing.
      const pad = Number.parseFloat(getComputedStyle(cell).paddingRight)
      const spill =
        pair.getBoundingClientRect().right - (cell.getBoundingClientRect().right - pad)
      await expect(Math.round(spill)).toBeLessThanOrEqual(1)
    })
  },
}

/**
 * The read has not come back.
 *
 * **The state this block had no story for**, and the one where its head can
 * say something the case does not: the body is gated behind the boundary, the
 * count beside the title is not, and it is derived from rows that have not
 * arrived. A case still loading and a case holding nothing then read the same
 * at the badge.
 */
export const Reading: Story = {
  name: 'The read has not come back',
  args: { kase: undefined, busy: true },
  play: async ({ canvas, step }) => {
    await step('the wait is drawn rather than a count of nothing', async () => {
      await expect(canvas.getByRole('status')).toBeInTheDocument()
      // `0 rows` is an answer, and nobody has one yet. The badge is what the
      // eye lands on beside the title, so it is the one asserted rather than
      // every zero the skeleton happens to draw.
      await expect(canvas.queryByText('0 rows')).toBeNull()
    })
  },
}

/**
 * A case far larger than the fixture, so the pager and the sticky head have
 * something to hold against.
 *
 * **Every screen in the entity family is this block**, so the volume they all
 * have to survive is drawn here once rather than at whichever scope somebody
 * happened to write it under. A table that capped itself at the fixture's rows
 * would render identically to `Every kind at once`.
 */
export const Dense: Story = {
  name: 'Far more rows than the fixture holds',
  args: {
    scope: 'accounts',
    kase: {
      ...campaignCase,
      accounts: Array.from({ length: 6 }, (_, copy) =>
        campaignCase.accounts.map((row) => ({
          ...row,
          id: `${row.id}-dense-${String(copy)}`,
        })),
      ).flat(),
    },
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('the table draws past the fixture`s own count', async () => {
      await expect(canvas.getAllByRole('row').length).toBeGreaterThan(
        campaignCase.accounts.length + 1,
      )
    })
  },
}

/**
 * The longest value a kind can hold, in the column that gives.
 *
 * A hostname is the widest thing an analyst types into this family, and the
 * cell truncates and carries its own `title` -- so a name too long for the
 * column stays reachable rather than being lost, and the columns beside it keep
 * their widths.
 */
export const LongestValue: Story = {
  name: 'The longest name a kind carries',
  args: {
    scope: 'assets',
    kase: {
      ...campaignCase,
      systems: [
        {
          ...campaignCase.systems[0]!,
          id: 'longest',
          hostname:
            'fin-prod-sql-cluster-node-07.corp.internal.meridian-logistics.example',
        },
        ...campaignCase.systems.slice(1),
      ],
    },
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('the whole value is reachable, not only what fits', async () => {
      await expect(
        canvas.getByTitle('fin-prod-sql-cluster-node-07.corp.internal.meridian-logistics.example'),
      ).toBeInTheDocument()
    })
  },
}

/**
 * A write another analyst got in first with.
 *
 * The refusal sits above the table rather than in a toast: it names a field and
 * a row, which is what the analyst has to reopen.
 */
export const Refused: Story = {
  name: 'A refused write',
  args: {
    scope: 'assets',
    refusal: { field: 'Verdict', row: 'FIN-WS-014', by: 'A. Okonkwo' },
  },
}

/**
 * The identity field's label on the served asset form.
 *
 * **The dialog asks a different question from the one the column heads.** The
 * table's column reads *Hostname* and `SYSTEM_FIELDS` asks for a name that
 * might be a mailbox or an app, so a story reaching for the column's word
 * finds nothing in the dialog.
 */
const IDENTITY = 'Name (hostname, mailbox, or app name)'

/** Versions no row in `campaign.json` carries, one per asset the stories drive. */
const VERSIONS: Readonly<Record<string, number>> = { 'DC-01': 9, 'FS-01': 4 }

/**
 * The demo case with two assets at versions nothing else in the tree carries.
 *
 * Every row in `campaign.json` is at version 1, which is also what a seam that
 * dropped the version and fell back to a default would send. The distinct
 * numbers are what let the stories below tell those two apart.
 */
const VERSIONED: Case = {
  ...campaignCase,
  systems: campaignCase.systems.map((row) => {
    const at = VERSIONS[row.hostname]
    return at === undefined ? row : { ...row, version: at }
  }),
}

/** One asset of the versioned case, by the name the table draws it under. */
function asset(hostname: string): SystemEntry {
  const found = VERSIONED.systems.find((row) => row.hostname === hostname)
  if (!found) throw new Error(`no ${hostname} among the campaign demo's assets`)
  return found
}

/** The write seam, spied on. A pair per story, since `fn` remembers its calls. */
function spying(): EntityWrites {
  return { save: fn(() => Promise.resolve({})), remove: fn(() => Promise.resolve()) }
}

/**
 * The add door, all the way through to the seam.
 *
 * **This block is six sections' write path** -- assets, accounts, network,
 * malware, cloud apps and the unscoped view -- and until this story none of
 * them showed what leaves. The seam is a prop rather than a fetch, so the
 * story can hold what the screen sends.
 *
 * `save` carries the collection, since five kinds sit behind one table and the
 * server has a different door for each. A null entry means a create.
 */
export const SendsANewRow: Story = {
  name: 'Sending a new row',
  args: { scope: 'assets', writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add asset' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Add asset' }))
    await userEvent.type(dialog.getByLabelText(IDENTITY), 'FIN-WS-099')
    await userEvent.click(dialog.getByRole('button', { name: /create|save/i }))

    // `systems`, not `assets`: the rail's slug and the server's collection are
    // two vocabularies, and this seam speaks the server's.
    await expect(args.writes!.save).toHaveBeenCalledWith(
      'systems',
      null,
      expect.objectContaining({ hostname: 'FIN-WS-099' }),
    )
  },
}

/**
 * The pencil, and the version the row was read at leaving with it.
 *
 * An edit names the row it changes and the version that row was drawn at. A
 * seam sending the id alone overwrites whatever another analyst put there in
 * between, and the screen it was typed on looks the same either way.
 */
export const SendsAnEdit: Story = {
  name: 'Sending an edit',
  args: { scope: 'assets', kase: VERSIONED, writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit DC-01 in full' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Edit asset' }))
    const name = dialog.getByLabelText(IDENTITY)
    await userEvent.clear(name)
    await userEvent.type(name, 'DC-01a')
    await userEvent.click(dialog.getByRole('button', { name: /create|save/i }))

    await expect(args.writes!.save).toHaveBeenCalledWith(
      'systems',
      { id: asset('DC-01').id, version: VERSIONS['DC-01'] },
      expect.objectContaining({ hostname: 'DC-01a' }),
    )
  },
}

/**
 * A delete, named on the version the screen read.
 *
 * **The version is sent with it.** A row another analyst has changed has
 * moved, and the server refuses rather than taking it.
 * The rows go from the local copy either way; what this holds is that the
 * server hears about it, with the collection and the version.
 */
export const SendsADelete: Story = {
  name: 'Sending a delete',
  args: { scope: 'assets', kase: VERSIONED, writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select DC-01' }))
    // `Delete 1` rather than a loose match: every row draws a bin of its own,
    // and the bulk bar's button is the one this story presses.
    await userEvent.click(await canvas.findByRole('button', { name: 'Delete 1' }))

    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: /delete/i }))

    await expect(args.writes!.remove).toHaveBeenCalledWith([
      { collection: 'systems', id: asset('DC-01').id, version: VERSIONS['DC-01'] },
    ])
  },
}

/**
 * The bulk bar, which is `save` again and once per row.
 *
 * **Not one call carrying a list.** The version check is per row, so each row
 * leaves at the version it was read at -- and the two rows here sit at
 * different versions, which a seam sending one number for the whole selection
 * cannot reproduce.
 */
export const SendsABulkApply: Story = {
  name: 'Sending a bulk apply',
  args: { scope: 'assets', kase: VERSIONED, writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select DC-01' }))
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Select FS-01' }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit 2' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit 2 selected' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Verdict$/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'clean' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))

    await expect(args.writes!.save).toHaveBeenCalledTimes(2)
    await expect(args.writes!.save).toHaveBeenCalledWith(
      'systems',
      { id: asset('DC-01').id, version: VERSIONS['DC-01'] },
      { verdict: 'clean' },
    )
    await expect(args.writes!.save).toHaveBeenCalledWith(
      'systems',
      { id: asset('FS-01').id, version: VERSIONS['FS-01'] },
      { verdict: 'clean' },
    )
  },
}
