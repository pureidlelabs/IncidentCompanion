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
     * **Arrowing moves the focus and commits nothing.**
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
 * Painted cells at a pane narrow enough to squeeze them.
 */
export const NarrowPaintedColumns: Story = {
  name: 'Painted columns at a narrow pane',
  args: { scope: 'assets' },
  render: (args) => (
    <div className="w-[900px] border border-dashed border-border">
      <EntityScopeTable {...args} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    await step('the containment state is drawn in its own column only', async () => {
      const badges = [...canvasElement.querySelectorAll('span')].filter(
        (el) => el.textContent.trim() === 'isolated',
      )
      const heads = [...canvasElement.querySelectorAll('th, [role="columnheader"]')]
      const column = heads.findIndex((one) => /isolated/i.test(one.textContent))
      await expect(column, 'the table draws no isolated column').toBeGreaterThan(-1)

      // A fixture with no isolated row would satisfy this by drawing nothing
      // anywhere, so the badge has to exist before its column can be asserted.
      await expect(badges.length, 'no row in the fixture is isolated').toBeGreaterThan(0)
      for (const badge of badges) {
        const cell = badge.closest('td, [role="gridcell"]')
        if (cell === null) throw new Error('a containment badge sits in no cell')
        const at = [...(cell.parentElement?.children ?? [])].indexOf(cell)
        await expect(at, 'a containment badge is drawn outside the isolated column').toBe(column)
      }
    })

    await step('every painted cell keeps its badge inside its own column', async () => {
      const painted = [...canvasElement.querySelectorAll('span')].filter((el) =>
        /^(isolated|compromised|accessed)$/.test(el.textContent.trim()),
      )
      // A fixture drawing none of them would satisfy any statement about their
      // boxes by never making one.
      await expect(painted.length, 'no row in the fixture is painted').toBeGreaterThan(0)

      for (const badge of painted) {
        const cell = badge.closest('td, [role="gridcell"]')
        if (!(cell instanceof HTMLElement)) throw new Error('a badge sits in no cell')

        // **Against the content edge, not the border edge.** The cell carries
        // `px-3`, so a border-box reading passes a badge sitting 12px into the
        // padding -- which is 12px of the gap that keeps one column off the
        // next, spent without the assertion noticing.
        const pad = Number.parseFloat(getComputedStyle(cell).paddingRight)
        const spill =
          badge.getBoundingClientRect().right - (cell.getBoundingClientRect().right - pad)
        await expect(
          Math.round(spill),
          `${badge.textContent.trim()} runs past its column`,
        ).toBeLessThanOrEqual(1)
      }
    })
  },
}

/**
 * The read has not come back.
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
 */
const IDENTITY = 'Name (hostname, mailbox, or app name)'

/** Versions no row in `campaign.json` carries, one per asset the stories drive. */
const VERSIONS: Readonly<Record<string, number>> = { 'DC-01': 9, 'FS-01': 4 }

/**
 * The demo case with two assets at versions nothing else in the tree carries.
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
