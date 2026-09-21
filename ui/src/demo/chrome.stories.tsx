import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { DemoChrome } from './chrome'

/**
 * What the evaluation build draws around the application.
 *
 * **The first thing a visitor meets, and the only gate in front of the demo.**
 * Nothing else on screen says a case never leaves the browser, so the dialog
 * says it and the visitor confirms it before anything can be typed.
 *
 * The acknowledgement is read at mount, so a story seeds it in a loader.
 */
const ACKNOWLEDGED = 'incidentcompanion.demo.acknowledged'

const seen = (value: '1' | null) => () => {
  try {
    if (value === null) window.localStorage.removeItem(ACKNOWLEDGED)
    else window.localStorage.setItem(ACKNOWLEDGED, value)
  } catch {
    // A refused store asks again, which is the dialog this story wants anyway.
  }
  return {}
}

const meta = {
  title: 'Demo/Chrome',
  component: DemoChrome,
  parameters: { layout: 'fullscreen' },
  args: { build: 'abc1234', onReset: fn() },
} satisfies Meta<typeof DemoChrome>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A first visit: the gate, before any of the application is reachable.
 *
 * The sentence about where the work goes is the load-bearing one, and it is
 * here rather than in the strip because this is the moment it is read.
 */
export const FirstVisit: Story = {
  name: 'The acknowledgement a first visit meets',
  loaders: [seen(null)],
  play: async ({ canvasElement, step }) => {
    // The dialog is portalled, so the canvas element does not contain it.
    const screen = within(canvasElement.ownerDocument.body)
    await step('it says what the demo does with what you type', async () => {
      await expect(screen.getByText(/stays in this\s+browser/)).toBeVisible()
      await expect(screen.getByText(/Nothing is sent anywhere/)).toBeVisible()
    })
    await step('and offers leaving as well as agreeing', async () => {
      await expect(screen.getByRole('button', { name: 'Understood' })).toBeVisible()
      await expect(screen.getByRole('button', { name: 'Leave' })).toBeVisible()
    })
  },
}

/**
 * A visit that has already agreed: the strip alone.
 *
 * The build is what a bug report needs, and the source offer is AGPL section
 * 13's rather than decoration -- publishing this over a network obliges an
 * offer of the corresponding source to the people using it.
 */
export const Acknowledged: Story = {
  name: 'The strip, once the dialog is answered',
  loaders: [seen('1')],
  play: async ({ canvas, step }) => {
    await step('it names the build', async () => {
      await expect(canvas.getByText('demo \u00B7 abc1234')).toBeVisible()
    })
    await step('and does not repeat what the dialog already said', async () => {
      await expect(canvas.queryByText(/stays in this browser/)).toBeNull()
    })
    await step('the source offer is there, because the licence asks for it', async () => {
      await expect(canvas.getByRole('link', { name: 'source' })).toBeVisible()
    })
  },
}

/**
 * Reset asks first, because it discards everything the visitor wrote.
 */
export const ResetAsksFirst: Story = {
  name: 'Reset, asking before it discards',
  loaders: [seen('1')],
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'reset' }))
    const screen = within(canvasElement.ownerDocument.body)
    // The dialog animates in, so it is present before it is painted and a
    // single read catches it at zero opacity.
    await waitFor(async () => {
      await expect(screen.getByText(/discarded/)).toBeVisible()
    })
    await expect(screen.getByRole('button', { name: 'Start again' })).toBeVisible()
  },
}
