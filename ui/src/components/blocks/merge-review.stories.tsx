import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { MergeReview } from './merge-review'

/**
 * The band a screen draws when another analyst's write got in first.
 *
 * Several analysts work one case at once and a field is saved against the
 * version the screen was drawn at. A save that finds a newer version is
 * refused, and this is the answer: whose value is in the field, and where to
 * go and read it.
 *
 * **Both halves of the answer are required, and which halves they are depends on
 * the surface.** A form has one of each field, so naming the field is enough. A
 * table has the same field on every row, so the field alone sends an analyst
 * looking down a column -- the row is the other half, and the band takes it.
 */
const meta = {
  title: 'Blocks/Notice/Merge review',
  component: MergeReview,
} satisfies Meta<typeof MergeReview>

export default meta
type Story = StoryObj<typeof meta>

/** A form has one of each field, so there is no row to name. */
export const OnAForm: Story = {
  name: 'A field another analyst set first',
  args: { field: 'Severity', by: 'A. Okonkwo' },
  play: async ({ canvas, step }) => {
    await step('It names the field and who set it', async () => {
      await expect(canvas.getByText(/Severity/)).toBeVisible()
      await expect(canvas.getByText(/A\. Okonkwo/)).toBeVisible()
    })

    await step('And says nothing about a row, there being none', async () => {
      await expect(canvas.queryByText(/FIN-WS/)).not.toBeInTheDocument()
    })
  },
}

/** A table has the same field on every row, so the row is half the answer. */
export const OnATable: Story = {
  name: 'One row of a table, named',
  args: { field: 'Verdict', by: 'R. Okonkwo', row: 'FIN-WS-014' },
  play: async ({ canvas, step }) => {
    await step('All three: the row, the field and the analyst', async () => {
      await expect(canvas.getByText(/FIN-WS-014/)).toBeVisible()
      await expect(canvas.getByText(/Verdict/)).toBeVisible()
      await expect(canvas.getByText(/R\. Okonkwo/)).toBeVisible()
    })
  },
}
