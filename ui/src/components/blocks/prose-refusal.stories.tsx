import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { ProseRefusal } from './prose-refusal'

/**
 * Why a document stopped taking what is typed into it.
 *
 * The two reasons read differently on purpose. A filed report is something
 * that happened *to* the analyst mid-sentence and is answerable with a time;
 * read-only reach is a standing fact about the case, and is the only refusal a
 * case note can give.
 */
const meta = {
  title: 'Blocks/Prose/Refusal',
  component: ProseRefusal,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ProseRefusal>

export default meta
type Story = StoryObj<typeof meta>

/** Only the three fields this draws from; the document itself is not read. */
function channel(because: 'read-only' | 'report-sent', refusedAt: string | null = null) {
  return { refusedAt, refusedBecause: because } as never
}

/** The report was filed by somebody else while this analyst was writing. */
export const ReportFiled: Story = {
  args: { channel: channel('report-sent', '2026-03-04T09:15:00.000Z') },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(/filed/i)
  },
}

/**
 * Filed, with no moment the server could name.
 *
 * The sentence loses the time rather than saying `Invalid Date`, which is what
 * an unparseable stamp used to render.
 */
export const FiledAtNoStatedTime: Story = {
  args: { channel: channel('report-sent', 'not-a-time') },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).not.toHaveTextContent(/Invalid Date/)
  },
}

/**
 * The analyst has read-only reach on the case.
 *
 * Nothing was filed, and saying so would be two wrong facts at once on a case
 * note, where this is the only refusal there is.
 */
export const ReadOnlyReach: Story = {
  args: { channel: channel('read-only') },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).not.toHaveTextContent(/filed/i)
  },
}
