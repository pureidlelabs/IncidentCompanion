import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { TlpChip } from './tlp-chip'

/**
 * The Traffic Light Protocol marking a report carries.
 */
const meta = {
  title: 'Blocks/Badge/TLP marking',
  component: TlpChip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TlpChip>

export default meta
type Story = StoryObj<typeof meta>

const LEVELS = ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED']

/**
 * The whole vocabulary, which is the thing worth seeing in one place.
 */
export const Levels: Story = {
  name: 'Every marking',
  args: { tlp: 'TLP:AMBER' },
  render: (args) => (
    <div className="flex flex-col items-start gap-2">
      {LEVELS.map((tlp) => (
        <TlpChip key={tlp} {...args} tlp={tlp} />
      ))}
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('every level of the standard is drawn', async () => {
      await expect(canvas.getAllByTestId('tlp-chip')).toHaveLength(LEVELS.length)
    })
    await step('each on the same black ground, which is what carries them', async () => {
      for (const chip of canvas.getAllByTestId('tlp-chip')) {
        await expect(chip).toHaveClass('bg-tlp-ground')
      }
    })
  },
}

/** One, as a table cell or a header draws it. */
export const Single: Story = {
  name: 'A single marking',
  args: { tlp: 'TLP:RED' },
  play: async ({ canvas, step }) => {
    await step('the marking is written out in full', async () => {
      await expect(canvas.getByTestId('tlp-chip')).toHaveTextContent('TLP:RED')
    })
    await step('and takes its own level`s ink', async () => {
      await expect(canvas.getByTestId('tlp-chip')).toHaveClass('text-tlp-red')
    })
  },
}

/**
 * `AMBER+STRICT` takes AMBER's colour, by the standard's choice.
 */
export const AmberPair: Story = {
  name: 'AMBER and AMBER+STRICT share a colour',
  args: { tlp: 'TLP:AMBER' },
  render: (args) => (
    <div className="flex items-center gap-2">
      <TlpChip {...args} />
      <TlpChip {...args} tlp="TLP:AMBER+STRICT" />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)
    await step('the two carry the same ink', async () => {
      const [amber, strict] = canvas.getAllByTestId('tlp-chip')
      await expect(amber).toHaveClass('text-tlp-amber')
      await expect(strict).toHaveClass('text-tlp-amber')
    })
    await step('and are told apart by the label alone', async () => {
      await expect(canvas.getByText('TLP:AMBER+STRICT')).toBeVisible()
    })
  },
}

/**
 * A level the map has not heard of.
 */
export const Unknown: Story = {
  name: 'A marking the map does not know',
  args: { tlp: 'TLP:PUCE' },
  play: async ({ canvas, step }) => {
    await step('the marking is still drawn, with its own words', async () => {
      await expect(canvas.getByTestId('tlp-chip')).toHaveTextContent('TLP:PUCE')
    })
    await step('and takes white rather than the page foreground', async () => {
      await expect(canvas.getByTestId('tlp-chip')).toHaveClass('text-tlp-clear')
    })
  },
}

/**
 * A marking that arrives in the wrong case.
 */
export const WrongCase: Story = {
  name: 'A marking written in lower case',
  args: { tlp: 'tlp:red' },
  play: async ({ canvas, step }) => {
    await step('it is coloured as RED rather than as unknown', async () => {
      await expect(canvas.getByTestId('tlp-chip')).toHaveClass('text-tlp-red')
    })
    await step('while the text stays as it arrived', async () => {
      await expect(canvas.getByTestId('tlp-chip')).toHaveTextContent('tlp:red')
    })
  },
}

/** Nothing at all: an unmarked report is not a report marked "none". */
export const Empty: Story = {
  name: 'No marking',
  args: { tlp: '' },
  play: async ({ canvas, step }) => {
    await step('no chip is drawn, and no placeholder either', async () => {
      await expect(canvas.queryByTestId('tlp-chip')).toBeNull()
    })
  },
}
