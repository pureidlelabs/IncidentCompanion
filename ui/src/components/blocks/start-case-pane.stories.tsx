import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { StartCasePane } from '@/components/blocks/start-case-pane'

/**
 * Where a case starts: blank, from a file, or from a live source, before the
 * wizard opens over it.
 *
 * The pane holds no state and decides nothing: it draws the doors and hands
 * back which was pressed. What varies between the stories is which of them the
 * install has, since either import needs a provider somebody configured.
 */
const meta = {
  title: 'Blocks/System/Start a case',
  component: StartCasePane,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof StartCasePane>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Every door, on an install with a provider configured.
 *
 * Across rather than down: they are weighed against each other, and none of
 * them is the recommended one.
 */
export const Default: Story = {
  name: 'Every way in',
  args: { onBlank: fn(), onImport: fn(), onLiveSource: fn() },
  play: async ({ args, canvas, step }) => {
    await step('each door says where the case would come from', async () => {
      await expect(
        canvas.getByText('An empty case, or one seeded from a case template.'),
      ).toBeVisible()
      await expect(canvas.getByText('Import incidents into a new case.')).toBeVisible()
      await expect(canvas.getByText('Start from a live source')).toBeVisible()
    })
    await step('and pressing one opens that form and not the other', async () => {
      await userEvent.click(canvas.getByText('Blank case'))
      await expect(args.onBlank).toHaveBeenCalledTimes(1)
      await expect(args.onImport).not.toHaveBeenCalled()
    })
  },
}

/**
 * An install with no provider configured.
 *
 * **Drawn and refused, rather than removed.** An operator who cannot see the
 * tile cannot tell an install that has no importer from one where the control
 * moved, and nothing else on this pane would say so. Refused, it leaves the tab
 * order and announces itself as unavailable.
 */
export const NoImporter: Story = {
  name: 'Nothing to import from',
  args: { onBlank: fn() },
  play: async ({ args, canvas, step }) => {
    await step('every tile is drawn, so the feature is still visible', async () => {
      await expect(canvas.getByText('Import incidents')).toBeVisible()
      await expect(canvas.getByText('Start from a live source')).toBeVisible()
      await expect(canvas.getByText('Blank case')).toBeVisible()
    })
    await step('the ones with nothing behind them are refused', async () => {
      const tiles = canvas.getAllByRole('button')
      for (const label of ['Import incidents', 'Start from a live source']) {
        await expect(tiles.find((one) => one.textContent.includes(label))).toBeDisabled()
      }
    })
    await step('and the wired one still acts', async () => {
      await userEvent.click(canvas.getByText('Blank case'))
      await expect(args.onBlank).toHaveBeenCalledTimes(1)
    })
  },
}

/**
 * No door wired.
 *
 * The pane at rest, which is what the docs page renders and what a screen shows
 * before its handlers are bound. Every tile is refused, so nothing here takes a
 * tab stop it cannot honour.
 */
export const Inert: Story = {
  name: 'No door wired',
  play: async ({ canvas, step }) => {
    await step('the pane still says what it is for', async () => {
      await expect(canvas.getByText('Pick where the case comes from.')).toBeVisible()
    })
    await step('and every tile is refused rather than silently dead', async () => {
      const tiles = canvas.getAllByRole('button')
      await expect(tiles).toHaveLength(3)
      for (const tile of tiles) await expect(tile).toBeDisabled()
    })
  },
}
