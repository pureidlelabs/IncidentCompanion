import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, waitFor } from 'storybook/test'

import { LanguagesPane } from '@/components/blocks/languages-pane'
import { LANGUAGE_KEY_COUNT, PICKER_LANGUAGES } from '@/components/blocks/picker-rows'

/**
 * What a report may be written in: the language table, floored coverage, and
 * how many strings a complete pack carries.
 *
 * The pane holds its rows in state so a removal is visible without a server, so
 * the stories below are whole panes driven from the one prop the screen passes.
 */
const meta = {
  title: 'Blocks/System/Languages',
  component: LanguagesPane,
  parameters: { layout: 'padded' },
  args: { languages: PICKER_LANGUAGES },
} satisfies Meta<typeof LanguagesPane>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The five packs a stock install offers, three of them shipped with the image.
 *
 * A built-in pack is read and never removed, and the row says so by offering no
 * removal rather than by refusing one -- a control that is drawn and then says
 * no is a worse answer than a control that was never there. Copying the name is
 * offered on every row regardless, so the menu opens either way and it is the
 * contents that separate the two kinds.
 */
export const Roster: Story = {
  name: 'Three built in, two uploaded',
  play: async ({ canvas, step }) => {
    await step('a pack that came with the image offers only its name', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'More for English' }))
      // The popover animates in, so the item exists a frame before it paints.
      // Wait on the node rather than on its box.
      const copy = await screen.findByRole('menuitem', { name: 'Copy English' })
      await waitFor(async () => {
        await expect(copy).toBeVisible()
      })
      await expect(screen.queryByRole('menuitem', { name: 'Remove\u2026' })).toBeNull()
      await userEvent.keyboard('{Escape}')
    })
    await step('and one that was uploaded can be taken away', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'More for Fran\u00e7ais' }))
      await expect(await screen.findByRole('menuitem', { name: 'Remove\u2026' })).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
    })
    await step('the pane states what a complete pack carries', async () => {
      await expect(
        canvas.getByText(`A complete pack carries ${String(LANGUAGE_KEY_COUNT)} strings.`),
      ).toBeVisible()
    })
  },
}

/**
 * Coverage a hair under complete.
 *
 * Floored, never rounded: 99.6% of the strings is not a complete pack, and
 * `100%` beside a report that silently falls back to English is the one number
 * on this pane that would be read as a promise.
 */
export const NearlyComplete: Story = {
  name: 'A pack four strings short',
  args: {
    languages: [
      { id: 'en', code: 'en', label: 'English', coverage: 1, builtin: true },
      { id: 'es', code: 'es', label: 'Espa\u00f1ol', coverage: 0.996, builtin: false },
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the incomplete pack is reported short', async () => {
      await expect(canvas.getByText('99%')).toBeVisible()
      await expect(canvas.queryAllByText('100%')).toHaveLength(1)
    })
  },
}

/**
 * Removing an uploaded pack.
 *
 * The row leaves the table on the press. Nothing here asks the server, so what
 * the story shows is the pane's own answer -- the screen replaces the prop when
 * the write lands, and the pane takes that over its held copy.
 */
export const Removing: Story = {
  name: 'Removing an uploaded pack',
  play: async ({ canvas, step }) => {
    await step('the pack is listed', async () => {
      await expect(canvas.getByText('Portugu\u00eas (Brasil)')).toBeVisible()
    })
    await step('its menu offers the removal', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'More for Portugu\u00eas (Brasil)' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove\u2026' }))
    })
    await step('and the row is gone, with the rest untouched', async () => {
      await expect(canvas.queryByText('Portugu\u00eas (Brasil)')).toBeNull()
      await expect(canvas.getByText('Fran\u00e7ais')).toBeVisible()
    })
  },
}

/**
 * An install carrying no packs at all.
 *
 * The upload control is drawn and refused in every story, because a pack is a
 * file the server stores and reads back -- there is no route from this screen
 * to put one anywhere. An empty table is the one place that reads as a dead
 * end, so the empty state says what would fill it.
 */
export const Empty: Story = {
  name: 'No pack installed',
  args: { languages: [] },
  play: async ({ canvas, step }) => {
    await step('the empty state says what a pack would buy', async () => {
      await expect(canvas.getByText('No language packs')).toBeVisible()
      await expect(
        canvas.getByText('Upload one, and every report can be written in it.'),
      ).toBeVisible()
    })
    await step('and the upload control names why it is refused', async () => {
      await expect(
        canvas.getByRole('button', { name: 'Upload a pack \u2014 stored by the server' }),
      ).toBeDisabled()
    })
  },
}

/**
 * Every pack a large install might hold, with the longest label among them.
 *
 * The label cell truncates and carries its own `title`, so a name too long for
 * the column is reachable rather than lost -- the code beside it is the shorter
 * handle, and the two columns divide that work between them.
 */
export const TooMany: Story = {
  name: 'Sixteen packs, one very long name',
  args: {
    languages: [
      ...PICKER_LANGUAGES,
      {
        id: 'zh-Hant-HK',
        code: 'zh-Hant-HK',
        label: 'Chinese (Traditional, Hong Kong SAR China)',
        coverage: 0.611,
        builtin: false,
      },
      ...Array.from({ length: 10 }, (_, at) => ({
        id: `pack-${String(at)}`,
        code: `q${String(at)}`,
        label: `Pack ${String(at + 1)}`,
        coverage: at / 10,
        builtin: at % 2 === 0,
      })),
    ],
  },
  play: async ({ canvas, step }) => {
    await step('the longest label is kept whole in a title', async () => {
      await expect(
        canvas.getByTitle('Chinese (Traditional, Hong Kong SAR China)'),
      ).toBeInTheDocument()
    })
    await step('and a pack with none of the strings reports zero rather than blank', async () => {
      await expect(canvas.getByText('0%')).toBeVisible()
    })
  },
}
