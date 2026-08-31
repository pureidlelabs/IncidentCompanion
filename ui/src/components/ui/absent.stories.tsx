import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { Absent } from './absent'

/**
 * A value the case does not hold.
 *
 * **The distinction the register turns on.** A blank cell reads as a column
 * that failed to render; this says the case was asked and had nothing. Promised
 * against collected, not-stated against nothing-came-back -- an analyst reading
 * a table has to be able to tell those apart at a glance.
 *
 * It exists because the mark was being drawn three ways under three names, and
 * none of them was a duplicate by name so nothing found it.
 */
const meta = {
  title: 'Styling/Absent value',
  component: Absent,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Absent>

export default meta
type Story = StoryObj<typeof meta>

/**
 * In a cell, where the column heading is already on screen.
 *
 * An em dash rather than an en dash or a hyphen: it is wide enough to read as a
 * deliberate mark at a glance down a column, where a hyphen reads as a stray
 * character and a blank reads as a cell that failed.
 */
export const Bare: Story = {
  name: 'In a column',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="absent"]')).toHaveTextContent(
      '\u2014',
    )
  },
}

/**
 * Named, for a detail panel where no heading carries the field.
 *
 * `timeline.tsx` drew this one, and drew it fainter -- which put the mark below
 * the contrast the ground carries everywhere else for no reason anybody wrote
 * down. One weight now.
 */
export const Labelled: Story = {
  name: 'Where nothing names the field',
  args: { label: 'Host' },
  play: async ({ canvasElement, step }) => {
    const mark = canvasElement.querySelector<HTMLElement>('[data-slot="absent"]')!

    await step('The field is named, and the mark still follows it', async () => {
      await expect(mark).toHaveTextContent('Host \u2014')
    })

    // The mark that has to be avoided is `text-ink-muted/70`, the same ink at
    // seven tenths, so the check is for the alpha and not for the hue. Tailwind
    // 4 compiles the modifier to a `color-mix`, which reads back as
    // `oklab(l a b / 0.7)` -- the alpha follows a slash, and an assertion
    // written for `rgba(r, g, b, a)` never sees it.
    await step('At full weight, not the faded mark it replaced', async () => {
      const alpha = /[/,]\s*([\d.]+)\s*\)$/.exec(getComputedStyle(mark).color)?.[1]
      await expect(alpha === undefined ? 1 : Number(alpha)).toBe(1)
    })
  },
}

/**
 * Beside a real value, which is the comparison that matters.
 *
 * The mark has to read as *absent* rather than as another value, and the only
 * way to judge that is next to one.
 */
export const AgainstAValue: Story = {
  name: 'Next to a value',
  play: async ({ canvas, step }) => {
    const marks = [...canvas.getAllByRole('cell')].filter(
      (cell) => cell.querySelector('[data-slot="absent"]') !== null,
    )
    const values = [...canvas.getAllByRole('cell')].filter(
      (cell) => cell.querySelector('[data-slot="absent"]') === null,
    )

    await step('The mark is dimmer than a value beside it', async () => {
      const markInk = getComputedStyle(marks[0]!.querySelector('span')!).color
      const valueInk = getComputedStyle(values[0]!).color
      await expect(markInk).not.toBe(valueInk)
    })

    // The register turns on telling one absence from another, so the two marks
    // in this table have to be the same mark -- a column drawn a shade fainter
    // than the one beside it reads as a third state that does not exist.
    await step('And every mark is the one mark', async () => {
      const inks = marks.map((cell) => getComputedStyle(cell.querySelector('span')!).color)
      await expect(new Set(inks).size).toBe(1)
    })
  },
  render: () => (
    <table className="text-sm">
      <tbody>
        <tr>
          <td className="pr-6">WKS-FIN01</td>
          <td className="pr-6">triage collection</td>
          <td>
            <Absent />
          </td>
        </tr>
        <tr>
          <td className="pr-6">FS-01</td>
          <td className="pr-6">
            <Absent />
          </td>
          <td>Confidential</td>
        </tr>
      </tbody>
    </table>
  ),
}
