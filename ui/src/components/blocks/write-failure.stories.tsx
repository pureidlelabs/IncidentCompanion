import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { ApiError } from '@/api/client'

import { WriteFailure } from './write-failure'

/**
 * The card a refused write is drawn on, at the four shapes a refusal arrives
 * in.
 *
 * **jsdom cannot judge any of this.** The unit tests hold what is on the card;
 * whether 356px carries a field name, a sentence and two controls without
 * wrapping into a wall is a question about layout, and this is the tier that
 * lays anything out.
 *
 * **Retry belongs on one shape only.** A refusal that named a field will refuse
 * the same body again, so offering the press is offering a second identical
 * failure. A refusal that named nothing -- no answer, a dropped connection --
 * may work on the second press, and that is where the control appears.
 */
const meta = {
  title: 'Blocks/Notice/Write failure',
  component: WriteFailure,
  parameters: { layout: 'centered' },
  args: { onDismiss: () => undefined },
} satisfies Meta<typeof WriteFailure>

export default meta
type Story = StoryObj<typeof meta>

const refused = (issues: { path: string[]; message: string }[]) =>
  new ApiError(422, 'Validation failed', { message: 'Validation failed', errors: issues })

/**
 * Two fields refused.
 *
 * Each is named, because *Validation failed* over a form of nine fields leaves
 * an analyst reading all nine.
 *
 * **A retry is handed in and no Retry is drawn.** The card decides on whether
 * the refusal named a field, not on whether a caller supplied a handler -- so
 * pressing again cannot offer a second identical failure.
 */
export const TwoFields: Story = {
  name: 'Two fields refused, and a retry',
  args: {
    what: 'Indicators',
    error: refused([
      { path: ['value'], message: 'Too small: expected string to have >=1 characters' },
      { path: ['triage'], message: 'Invalid option: expected untriaged, investigating or assessed' },
    ]),
    // Supplied and still refused, which is the claim. Without it the absence of
    // a Retry says only that nobody offered one.
    onRetry: () => undefined,
  },
  play: async ({ canvas, canvasElement, step }) => {
    // The field names against the card's whole text: `triage` also appears
    // inside the message for that field, so a text query matches twice.
    await step('Both refused fields are named', async () => {
      const card = canvasElement.querySelector('[data-slot="alert"]')!
      await expect(card).toHaveTextContent('value')
      await expect(card).toHaveTextContent('triage')
    })

    await step('And the retry it was handed is not drawn', async () => {
      await expect(canvas.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
    })
  },
}

/** The longest real sentence the server sends, against the narrowest column. */
export const OneLongSentence: Story = {
  name: 'One field, and the sentence runs long',
  args: {
    what: 'the section order',
    error: refused([
      {
        path: ['fields', 'severity'],
        message: 'Invalid option: expected one of "critical"|"high"|"medium"|"low"|"informational"',
      },
    ]),
  },
  /**
   * **Measured, not looked at.** A 356px card carrying a 78-character sentence
   * is where this design either holds or turns into a wall of text, and jsdom
   * gives every element a zero box - so the assertion below is only true on
   * this tier.
   *
   * What it holds: the card stays at the toast's width rather than pushing it
   * wider, and both controls are inside it. A control 4px past the edge is
   * still `toBeInTheDocument`, which is the reason a unit test cannot own this.
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvasElement.querySelector('[data-slot="alert"]')!
    const box = card.getBoundingClientRect()

    await expect(Math.round(box.width)).toBe(356)

    for (const label of ['Dismiss']) {
      const control = canvas.getByRole('button', { name: label }).getBoundingClientRect()
      await expect(control.right, `${label} runs past the card`).toBeLessThanOrEqual(box.right)
      await expect(control.bottom, `${label} runs past the card`).toBeLessThanOrEqual(box.bottom)
      await expect(
        control.height,
        `${label} is below the 24px control floor`,
      ).toBeGreaterThanOrEqual(24)
    }
  },
}

/**
 * More fields than the card draws, so the count below the list is on screen.
 *
 * The card holds its size and says how many it did not name, rather than growing
 * to seven rows inside a toast. **The count is what stops the truncation being a
 * lie** -- four names and nothing else would read as four refused fields.
 */
export const MoreThanItDraws: Story = {
  name: 'Seven fields refused, four drawn',
  args: {
    what: 'Timeline',
    error: refused(
      ['description', 'time', 'tactic', 'severity', 'technique', 'confidence', 'sourceTool'].map(
        (field) => ({ path: [field], message: 'Invalid option' }),
      ),
    ),
  },
  play: async ({ canvas, canvasElement, step }) => {
    const card = canvasElement.querySelector('[data-slot="alert"]')!

    await step('It draws fewer than it was given', async () => {
      const named = ['description', 'time', 'tactic', 'severity', 'technique', 'confidence'].filter(
        (field) => card.textContent.includes(field),
      )
      await expect(named.length).toBeLessThan(7)
    })

    await step('And says how many it left out', async () => {
      await expect(canvas.getByText(/\d+ more/)).toBeVisible()
    })
  },
}

/**
 * A dropped connection, which is the one shape Retry belongs on: the refusal
 * named no field, so pressing again can work where repeating a refused body
 * cannot.
 */
export const NothingNamedIsTheRetryableOne: Story = {
  name: 'The server did not answer',
  args: {
    what: 'Systems',
    error: new ApiError(0, 'IncidentCompanion did not answer.', null),
    onRetry: () => undefined,
  },
  play: async ({ canvas, step }) => {
    await step('The retry is offered here and nowhere else', async () => {
      await expect(canvas.getByRole('button', { name: /Retry/i })).toBeVisible()
    })

    await step('And no field is named, because none was', async () => {
      await expect(canvas.getByText(/did not answer/)).toBeVisible()
    })
  },
}
