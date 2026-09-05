import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { ApiError } from '@/api/client'

import { WriteFailure } from './write-failure'

/**
 * The card a refused write is drawn on, at the four shapes a refusal arrives
 * in.
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
   * **Measured, not looked at.**
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
