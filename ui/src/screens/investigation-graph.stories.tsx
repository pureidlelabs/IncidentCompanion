import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { InvestigationGraphScreen } from './investigation-graph'
import { EMPTY_CAMPAIGN } from './timeline-entries'
import { inACase } from '@/fixtures/in-a-case'

/**
 * What the case names, and what names it.
 */
const meta = {
  title: 'Screens/Correlate/Investigation graph',
  component: InvestigationGraphScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [inACase('investigation-graph')],
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof InvestigationGraphScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The whole campaign: every kind of event against every entity it reaches. */
export const Populated: Story = {
  name: 'The whole case',
  // The readout is the one number that says the drawing is over real data. A
  // figure that folded every entry into one node renders a tidy picture and
  // says "1 kind of event", which nothing else on the screen contradicts.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const readout = await canvas.findByText(/kinds of event over \d+ entities/)
    const [kinds, entities] =
      /(\d+) kinds of event over (\d+) entities/.exec(readout.textContent)?.slice(1) ?? []
    await expect(Number(kinds)).toBeGreaterThan(1)
    await expect(Number(entities)).toBeGreaterThan(Number(kinds))
  },
}

/**
 * Assets and accounts hidden, which is what the chips are for.
 */
export const Narrowed: Story = {
  name: 'Two kinds hidden',
  args: { hidden: ['system', 'account'] },
}

/**
 * The list, which is the half of the screen a drawing cannot do.
 */
export const Listing: Story = {
  play: async ({ canvas, step }) => {
    await step('the list names the entities no entry mentions', async () => {
      // The drawing has nowhere to put them, so the list is the only place
      // they appear -- and they are the rows an analyst opened it for.
      await expect(canvas.getAllByText(/in no entry/).length).toBeGreaterThan(0)
    })
    await step('and says how many there are', async () => {
      await expect(canvas.getByText(/entities no entry names/)).toBeVisible()
    })
  },
  name: 'The node list',
  args: { listing: true },
}

/** Nothing to draw. The overlay says what makes a graph rather than what is missing. */
export const Empty: Story = {
  name: 'Nothing to show yet',
  args: { kase: EMPTY_CAMPAIGN },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Nothing to show yet')).toBeVisible()
  },
}

/**
 * A case whose entities are recorded and named by nothing.
 */
export const AllUnnarrated: Story = {
  play: async ({ canvas, step }) => {
    await step('the count is a door rather than a statistic', async () => {
      // Every collection is filled and the timeline is empty, so the drawing
      // has no node and the count is the whole answer -- and a count nobody
      // can act on is a dashboard, so it opens the one surface that can show
      // them.
      const count = canvas.getByRole('button', { name: /recorded, in no entry/ })
      await expect(count).toBeVisible()
      await userEvent.click(count)
    })
    await step('and it opens the list, which is that surface', async () => {
      await expect(await canvas.findByText(/entities no entry names/)).toBeInTheDocument()
    })
  },
  name: 'Entities no entry names',
  args: { kase: { ...campaignCase, timeline: [] } },
}

/**
 * Partway through the incident, which is a different question from the
 * timeline's brush.
 */
export const PartwayThrough: Story = {
  name: 'What was known by then',
  args: { upToMinutes: 90 },
  play: async ({ canvas }) => {
    // **What the dimming does is not readable here.** Cytoscape paints to a
    // `<canvas>`, so there is no element per node for a query to count -- the
    // property that some nodes are held back and not all of them is held by
    // `incident-graph.test.ts` over the model instead. What this can see is
    // that the cursor is somewhere other than the end, which is the state the
    // story exists to draw.
    await expect(await canvas.findByRole('slider')).toBeInTheDocument()
  },
}

/**
 * A node picked, which is where the way to its record is.
 */
export const Picked: Story = {
  name: 'A node and its door',
  args: { selected: campaignCase.systems[0]!.id },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('link', { name: 'Open in Assets' })).toBeVisible()
  },
}

/** A 520px pane: the toolbar readout truncates rather than pushing the control out. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="flex min-h-0 w-[520px] flex-1 flex-col border border-dashed border-border p-2">
      <InvestigationGraphScreen {...args} />
    </div>
  ),
}

/** A hostname past every label width on the screen, in the list and the readout. */
export const Overlong: Story = {
  name: 'A name too long for its row',
  args: { listing: true, kase: withLongHostname() },
}

/** One host renamed to something no column was measured for. */
function withLongHostname() {
  return {
    ...campaignCase,
    systems: campaignCase.systems.map((row, at) =>
      at === 0
        ? { ...row, hostname: 'wks-fin01.finance.corp.meridian-logistics.example.internal' }
        : row,
    ),
  }
}

/** Five sites, which is the estate this screen is judged at. */
const SITES = [0, 1, 2, 3, 4]

/**
 * An estate five times the demo's, with the entries that name it.
 */
export const Dense: Story = {
  name: 'A large estate on the drawing',
  args: { kase: manyEntities() },
  // The readout is the one number that says the drawing is over the whole
  // case rather than the slice that fitted.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const readout = await canvas.findByText(/kinds of event over \d+ entities/)
    const entities = /over (\d+) entities/.exec(readout.textContent)?.[1]
    await expect(Number(entities)).toBeGreaterThan(60)
  },
}

/** The same case as the list, which is the view that scrolls rather than crowds. */
export const DenseListing: Story = {
  name: 'A large estate, listed',
  args: { listing: true, kase: manyEntities() },
  // The list holds a row per entity, so its length is what says the whole
  // estate arrived rather than the slice the drawing had room for.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = await canvas.findAllByRole('listitem')
    await expect(rows.length).toBeGreaterThan(60)
  },
}

/**
 * The demo's hosts and accounts five times over, each copy under its own site,
 * with the entries that name them copied alongside.
 */
function manyEntities(): Case {
  return {
    ...campaignCase,
    systems: SITES.flatMap((site) =>
      campaignCase.systems.map((row) => ({
        ...row,
        id: idAt(row.id, site),
        hostname: site === 0 ? row.hostname : `${row.hostname}-s${String(site)}`,
      })),
    ),
    accounts: SITES.flatMap((site) =>
      campaignCase.accounts.map((row) => ({
        ...row,
        id: idAt(row.id, site),
        accountName: site === 0 ? row.accountName : `s${String(site)}.${row.accountName}`,
      })),
    ),
    timeline: SITES.flatMap((site) =>
      campaignCase.timeline.map((entry) =>
        // Both arms spelled out, because a spread over the union widens the
        // row's `kind` and the copy stops being an event or an action.
        entry.kind === 'event'
          ? {
              ...entry,
              id: idAt(entry.id, site),
              systemId: typeof entry.systemId === 'string' ? idAt(entry.systemId, site) : entry.systemId,
              accountIds: entry.accountIds.map((id) => idAt(id, site)),
            }
          : {
              ...entry,
              id: idAt(entry.id, site),
              systemId: typeof entry.systemId === 'string' ? idAt(entry.systemId, site) : entry.systemId,
              accountIds: entry.accountIds.map((id) => idAt(id, site)),
            },
      ),
    ),
  }
}

/** The same row's id at another site, and the unchanged id at the first. */
function idAt(id: string, site: number) {
  return site === 0 ? id : `${id}-site-${String(site)}`
}
