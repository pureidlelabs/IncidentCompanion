import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'
import { inACase } from '@/fixtures/in-a-case'

import { OverviewScreen } from './overview'

/**
 * The case overview: three tabs over one record.
 */
const meta = {
  title: 'Screens/Overview/Overview',
  component: OverviewScreen,
  decorators: [inACase('overview')],
  parameters: { layout: 'fullscreen' },
  args: { kase: campaignCase, specs: specsFixture, record: campaignCompliance },
} satisfies Meta<typeof OverviewScreen>

export default meta
type Story = StoryObj<typeof meta>

/** The tab an analyst lands on: the clocks, and what is outstanding. */
export const Read: Story = {
  name: 'The read tab',
  // The queue is the tab. A build that returns nothing renders a clean page
  // with an encouraging sentence, which is indistinguishable from a finished
  // case until the rows are counted.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const queue = await canvas.findByRole('region', { name: 'Open items' })
    await expect(within(queue).getAllByRole('listitem').length).toBeGreaterThan(0)
  },
}

/**
 * The case's own record, reached by the tab.
 */
export const Properties: Story = {
  name: 'The properties tab',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('tab', { name: 'Properties' }))
    await expect(await canvas.findByLabelText('Incident class')).toBeInTheDocument()
  },
}

/** The five stamps, on the tab rather than in the flyout. */
export const KeyTimes: Story = {
  name: 'The key times tab',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('tab', { name: 'Key times' }))
    await expect(await canvas.findByLabelText('Contained at')).toBeInTheDocument()
  },
}

/** The same five stamps, reached from the case header without leaving the tab. */
export const Flyout: Story = {
  name: 'The key times flyout',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Key times/ }))
    // The panel is a modal and renders outside the canvas element, and it
    // slides in - so the field is in the document a frame before it is painted.
    const field = await within(document.body).findByLabelText('Eradicated at')
    await waitFor(async () => {
      await expect(field).toBeInTheDocument()
    })
  },
}

/**
 * A field another analyst saved first.
 */
export const Refused: Story = {
  name: 'A refused write',
  args: { refusal: { field: 'Severity', by: 'A. Okonkwo' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Severity was not saved')).toBeInTheDocument()
  },
}

/** A stamp refused: the same band, on the key times tab. */
export const RefusedTime: Story = {
  name: 'A refused stamp',
  args: { refusal: { field: 'Contained at', by: 'A. Okonkwo' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Contained at was not saved')).toBeInTheDocument()
    await expect(await canvas.findByLabelText('Recovered at')).toBeInTheDocument()
  },
}

/** Every field answered, which is what a case looks like at write-up. */
export const Complete: Story = {
  play: async ({ canvas, step }) => {
    await step('the same three tabs, in the same order, once every field is answered', async () => {
      // The other half: asserting the shape survives an empty case says
      // nothing unless it is the same shape when the case is full.
      await expect(
        canvas.getAllByRole('tab').map((one) => one.textContent),
      ).toEqual(['Read', 'Properties', 'Key times'])
    })
  },
  name: 'Fully classified',
  args: { kase: classified() },
}

/** A new case: a reference and nothing else. The groups keep their shape. */
export const Empty: Story = {
  play: async ({ canvas, step }) => {
    await step('all three tabs are offered on a case with nothing in it', async () => {
      // A screen that collapsed to its answered fields would teach a different
      // shape on every case, and the one an analyst learns first is the one
      // with nothing in it.
      for (const tab of ['Read', 'Properties', 'Key times']) {
        await expect(canvas.getByRole('tab', { name: tab })).toBeVisible()
      }
    })
  },
  name: 'A case just opened',
  args: {
    kase: {
      ...campaignCase,
      title: '',
      customer: '',
      analyst: '',
      summary: '',
      detectionSource: '',
      initialAccessVector: '',
      detectionGap: '',
    },
  },
}

/** A 414px viewport: the tab row scrolls rather than wrapping. */
export const Narrow: Story = {
  name: 'A narrow viewport',
  globals: { viewport: { value: 'mobile2' } },
}

/** Every case field this screen draws, filled the way an analyst would. */
function classified(): Case {
  return {
    ...campaignCase,
    analyst: 'Demo Analyst',
    severity: 'critical',
    incidentClass: 'hacking',
    detectionSource: 'EDR',
    initialAccessVector: 'phishing attachment',
    detectionGap: 'The macro executed four hours before the first EDR alert.',
    detectedAt: '2026-08-13T16:16:41.775Z',
    containedAt: '2026-08-16T09:40:00.000Z',
    eradicatedAt: '2026-08-17T14:05:00.000Z',
    recoveredAt: '2026-08-19T08:00:00.000Z',
  }
}
