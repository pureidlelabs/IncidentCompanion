import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { EMPTY_CASE } from '@/components/blocks/entity-scope'
import { IndicatorsScreen } from './indicators'

/**
 * What this case would hand to a blocklist or a TIP.
 */
const meta = {
  title: 'Screens/Report/Indicators',
  component: IndicatorsScreen,
  parameters: { layout: 'padded' },
  decorators: [
    // `fills` gives the section the pane's height, so a story has to supply one.
    (Story) => (
      <div className="h-[34rem]">
        <Story />
      </div>
    ),
  ],
  args: { kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof IndicatorsScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every derived row: network indicators, malware digests with a usable hash,
 * and consented applications.
 */
export const Populated: Story = {
  name: 'Derived from the case',
  // The two numbers the badge exists to contrast. They read identically while
  // a blank disposition counted as actionable, which is every case holding a
  // cloud app.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = await canvas.findByText(/derived, .* actionable/)
    const [derived, actionable] = badge.textContent.match(/\d+/g) ?? []
    await expect(Number(derived)).toBeGreaterThan(Number(actionable))
    // Every digest in the demo is a real sha256, so the malware rows are here.
    await expect(await canvas.findAllByText('sha256')).not.toHaveLength(0)
  },
}

/**
 * Every indicator benign, which is the one case worth warning about.
 */
export const NothingToPush: Story = {
  name: 'Nothing actionable',
  args: {
    kase: {
      ...campaignCase,
      networkIndicators: campaignCase.networkIndicators.map((row) => ({
        ...row,
        disposition: 'benign',
      })),
      malware: campaignCase.malware.map((row) => ({ ...row, verdict: 'clean' })),
    },
  },
  // The cloud apps stay: removing them is what makes this pass over a warning
  // that cannot fire.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Every indicator in this case is benign'),
    ).toBeVisible()
  },
}

/** No indicators anywhere in the case. */
export const Empty: Story = {
  name: 'No indicators',
  args: { kase: EMPTY_CASE },
  play: async ({ canvas, step }) => {
    await step('the absence is named, with what would fill it', async () => {
      await expect(canvas.getByText('No indicators in this case')).toBeVisible()
      await expect(
        canvas.getByText(/appear here as they are recorded/),
      ).toBeVisible()
    })
  },
}

/** A different empty, and different words. */
export const NoMatch: Story = {
  name: 'Filtered to nothing',
  args: { search: 'no indicator says this' },
  play: async ({ canvas, step }) => {
    await step('it does not say the case holds no indicators', async () => {
      // The case is full; a search hid them. Saying otherwise sends an analyst
      // to go and record indicators that are already there.
      await expect(canvas.queryByText('No indicators in this case')).toBeNull()
    })
  },
}

/**
 * The case's network indicators and malware digests, each copied four times:
 * over a hundred derived rows, with the marking, the export row and the
 * pinned footer all still reachable under a scrolling table.
 */
export const Dense: Story = {
  name: 'A hundred derived rows',
  args: { kase: manyIndicators() },
  // The claim the name makes: the readout counts every copy, not the four
  // the campaign fixture holds on its own.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = await canvas.findByText(/\d+ derived, \d+ actionable/)
    const [derived] = badge.textContent.match(/\d+/g) ?? []
    await expect(Number(derived)).toBeGreaterThan(50)
  },
}

/** A 420px pane, with the export row still pinned under the table. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="h-[34rem] w-[420px] border border-dashed border-border p-2">
      <IndicatorsScreen {...args} />
    </div>
  ),
}

/**
 * A URL and a context past their columns.
 */
export const Overlong: Story = {
  name: 'A value too long for its column',
  args: {
    kase: {
      ...campaignCase,
      networkIndicators: campaignCase.networkIndicators.map((row, at) =>
        at === 0
          ? {
              ...row,
              value:
                'https://cdn.updates-delivery.example/v2/loader/stage2?id=8f3a1c9e&campaign=meridian-logistics',
              context:
                'Cobalt Strike C2 node 1, beaconing every 60 seconds from three finance workstations',
            }
          : row,
      ),
    },
  },
}

/** Four copies of the case's network indicators, malware and cloud apps. */
function manyIndicators() {
  const copies = <T extends { id: string }>(rows: readonly T[]) =>
    Array.from({ length: 4 }, (_, copy) =>
      rows.map((row) => ({ ...row, id: `${row.id}-dense-${String(copy)}` })),
    ).flat()
  return {
    ...campaignCase,
    networkIndicators: copies(campaignCase.networkIndicators),
    malware: copies(campaignCase.malware),
    cloudApps: copies(campaignCase.cloudApps),
  }
}
