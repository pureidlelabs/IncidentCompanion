import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { KillchainCoverageScreen } from './killchain-coverage'
import { EMPTY_CAMPAIGN } from './timeline-entries'

/**
 * Whether the chain is accounted for.
 *
 * The absences are the point of the screen, so every story is chosen for what
 * it leaves unaccounted rather than for what it covers.
 */
const meta = {
  title: 'Screens/Correlate/Kill chain coverage',
  component: KillchainCoverageScreen,
  parameters: { layout: 'padded' },
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof KillchainCoverageScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Nine of eighteen phases observed, and the nine that are not are named.
 *
 * Twelve of the demo's thirty hosts sit on no phase at all, which is the row
 * an analyst acts on: either the intrusion never touched them, or nobody has
 * looked.
 */
export const Populated: Story = {
  name: 'Nine phases reached, nine not',
  // The absences are what the screen exists for, and a coverage build that
  // places every host renders a table that reads complete. The unplaced count
  // is the one number that cannot be right by accident.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findAllByText('not observed')).not.toHaveLength(0)
    const unplaced = canvasElement.querySelector('[data-testid="coverage-unplaced"]')
    await expect(unplaced).not.toBeNull()
    await expect(unplaced?.textContent).toMatch(/\d+ of \d+ hosts not on the chain/)

    // Every observed phase is a door onto the entries behind it. A coverage
    // table with no way to the evidence is a chart rather than a tool.
    const pivots = canvasElement.querySelectorAll('a[href*="/timeline?step="]')
    await expect(pivots.length).toBeGreaterThan(0)
  },
}

/**
 * Events filed against `policy violation`, which the chain has no stage for.
 *
 * The vocabulary publishes it and the table has no row for it, so it is
 * counted as an absence rather than drawn as a nineteenth phase.
 */
export const OutsideTheChain: Story = {
  name: 'Events the chain has no stage for',
  args: { kase: withOutsiders() },
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll('[data-slot="killchain-ribbon"] > li')
    await expect(rows).toHaveLength(18)
    await expect(canvasElement.querySelector('[data-testid="coverage-not-a-phase"]')).not.toBeNull()
  },
}

/** Every event untagged: eighteen phases, none observed, one sentence saying so. */
export const NoneObserved: Story = {
  play: async ({ canvas, step }) => {
    await step('every phase is drawn, and every one marked unobserved', async () => {
      // The ribbon is the whole point: phases nobody tagged are the gaps an
      // analyst is looking for, so they are rows rather than omissions.
      await expect(canvas.getAllByTitle(/not observed/).length).toBeGreaterThan(0)
    })
  },
  name: 'Nothing filed against a phase',
  args: { kase: untagged() },
}

/** A case with no events at all. Every phase is a row and every row is absent. */
export const Empty: Story = {
  name: 'A case with no events',
  args: { kase: EMPTY_CAMPAIGN },
}

/**
 * An install serving no phase vocabulary.
 *
 * The screen has nothing to account for and says so, rather than drawing an
 * empty ribbon that reads as full coverage of nothing.
 */
export const NoVocabulary: Story = {
  play: async ({ canvas, step }) => {
    await step('the screen says there is nothing to account for', async () => {
      // An empty ribbon reads as full coverage of nothing, which is the one
      // wrong answer this screen can give.
      await expect(canvas.getByText('No kill chain phases in this install')).toBeVisible()
      await expect(canvas.getByText(/served by the app/)).toBeVisible()
    })
  },
  name: 'No phase vocabulary served',
  args: {
    specs: { ...specsFixture, vocabularies: { ...specsFixture.vocabularies, ukcPhase: [] } },
  },
}

/** A 520px pane: the ribbon and the table both scroll sideways rather than squeezing. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[520px] border border-dashed border-border p-2">
      <KillchainCoverageScreen {...args} />
    </div>
  ),
}

/** A hostname past the Evidence column, which truncates rather than widening it. */
export const Overlong: Story = {
  name: 'A hostname too long for its column',
  args: {
    kase: {
      ...campaignCase,
      systems: campaignCase.systems.map((row, at) =>
        at === 0
          ? { ...row, hostname: 'wks-fin01.finance.corp.meridian-logistics.example.internal' }
          : row,
      ),
    },
  },
}

/**
 * An estate of 150 hosts, which is the size a coverage table is read at.
 *
 * The phase band stays at the top of the pane while the rows run under it, and
 * the unplaced count carries the number an analyst acts on.
 */
export const Dense: Story = {
  name: 'A large estate',
  args: { kase: manyHosts() },
  // The count is what says the whole estate reached the table.
  play: async ({ canvasElement }) => {
    const unplaced = canvasElement.querySelector('[data-testid="coverage-unplaced"]')
    await expect(unplaced?.textContent).toMatch(/of 150 hosts not on the chain/)
  },
}

// ---------------------------------------------------------------------------

/** Six events refiled against the vocabulary member that is not a phase. */
function withOutsiders() {
  let moved = 0
  return {
    ...campaignCase,
    timeline: campaignCase.timeline.map((entry) => {
      if (entry.kind !== 'event' || moved >= 6) return entry
      moved += 1
      return { ...entry, ukcPhase: 'policy violation' }
    }),
  }
}

/** Every event with its phase cleared, which is what an unreviewed import looks like. */
function untagged() {
  return {
    ...campaignCase,
    timeline: campaignCase.timeline.map((entry) =>
      entry.kind === 'event' ? { ...entry, ukcPhase: '' } : entry,
    ),
  }
}

/** The demo's thirty hosts five times over, each copy under its own site. */
function manyHosts() {
  return {
    ...campaignCase,
    systems: [0, 1, 2, 3, 4].flatMap((site) =>
      campaignCase.systems.map((row) => ({
        ...row,
        id: `${row.id}-site-${String(site)}`,
        hostname: site === 0 ? row.hostname : `${row.hostname}-s${String(site)}`,
      })),
    ),
  }
}
