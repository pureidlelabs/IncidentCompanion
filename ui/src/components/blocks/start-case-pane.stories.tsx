import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { StartCasePane } from '@/components/blocks/start-case-pane'

/**
 * Where a case starts: a blank case, or an import, before the wizard opens
 * over it.
 *
 * The pane holds no state and decides nothing: it draws two doors and hands
 * back which was pressed. What varies between the stories is which of the two
 * the install has, since an import needs a provider somebody configured.
 */
const meta = {
  title: 'Blocks/System/Start a case',
  component: StartCasePane,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof StartCasePane>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Both doors, on an install with a provider configured.
 *
 * Two across rather than a list down: they are a pair to weigh against each
 * other, and neither is the recommended one.
 */
export const Default: Story = {
  name: 'Both ways in',
  args: { onBlank: fn(), onImport: fn() },
  play: async ({ args, canvas, step }) => {
    await step('each door says where the case would come from', async () => {
      await expect(
        canvas.getByText('An empty case, or one seeded from a case template.'),
      ).toBeVisible()
      await expect(canvas.getByText('Import incidents into a new case.')).toBeVisible()
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
    await step('both tiles are drawn, so the feature is still visible', async () => {
      await expect(canvas.getByText('Import incidents')).toBeVisible()
      await expect(canvas.getByText('Blank case')).toBeVisible()
    })
    await step('the one with nothing behind it is refused', async () => {
      const tiles = canvas.getAllByRole('button')
      const importer = tiles.find((one) => one.textContent.includes('Import incidents'))
      await expect(importer).toBeDisabled()
    })
    await step('and the wired one still acts', async () => {
      await userEvent.click(canvas.getByText('Blank case'))
      await expect(args.onBlank).toHaveBeenCalledTimes(1)
    })
  },
}

/**
 * Neither door wired.
 *
 * The pane at rest, which is what the docs page renders and what a screen shows
 * before its handlers are bound. Every tile is refused, so nothing here takes a
 * tab stop it cannot honour.
 */
export const Inert: Story = {
  name: 'Neither door wired',
  play: async ({ canvas, step }) => {
    await step('the pane still says what it is for', async () => {
      await expect(canvas.getByText('Pick where the case comes from.')).toBeVisible()
    })
    await step('and every tile is refused rather than silently dead', async () => {
      const tiles = canvas.getAllByRole('button')
      await expect(tiles).toHaveLength(2)
      for (const tile of tiles) await expect(tile).toBeDisabled()
    })
  },
}
