import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { ApiError } from '@/api/client'

import { CaseList } from './case-list'
import { PICKER_CASES } from './picker-rows'

/**
 * Every case on this install, on its own.
 */
const meta = {
  title: 'Blocks/Table/Case list',
  component: CaseList,
  parameters: { layout: 'fullscreen' },
  args: { cases: PICKER_CASES },
} satisfies Meta<typeof CaseList>

export default meta
type Story = StoryObj<typeof meta>

/** Six of the analyst's own cases; the demo is filtered out until asked for. */
export const Populated: Story = {
  name: 'Cases on this install',
  play: async ({ canvas, step }) => {
    await step('the analyst`s own cases are listed', async () => {
      await expect(canvas.getAllByRole('row').length).toBeGreaterThan(1)
    })
    await step('and the demo is held back until it is asked for', async () => {
      const demo = PICKER_CASES.find((one) => one.isDemo)
      if (demo !== undefined) await expect(canvas.queryByText(demo.title)).toBeNull()
    })
    await step('with neither write wired, the row offers neither', async () => {
      await expect(canvas.queryByRole('button', { name: /pin/i })).toBeNull()
    })
  },
}

/**
 * The same list, with the row's writes wired.
 */
export const Actionable: Story = {
  name: 'With the row\u2019s verbs',
  args: {
    pinnedIds: ['7c1a4b90'],
    onDelete: () => undefined,
    onTogglePin: () => undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('button', { name: /pin/i }).length).toBeGreaterThan(0)
  },
}

/**
 * A fresh install, which is the first thing anybody sees.
 */
export const Empty: Story = {
  name: 'An install with no cases',
  args: {
    cases: [],
    onNewCase: () => undefined,
    onImportIncidents: () => undefined,
    onImportArchive: () => undefined,
    onDemoCases: () => undefined,
  },
  play: async ({ canvas, step }) => {
    await step('the table and its toolbar are both gone', async () => {
      await expect(canvas.queryByRole('grid')).toBeNull()
      await expect(canvas.queryByRole('searchbox')).toBeNull()
    })
    await step('and all four ways in are offered', async () => {
      for (const way of ['New case', 'Import incidents', 'Import archive', 'Demo cases']) {
        await expect(canvas.getByText(way)).toBeVisible()
      }
    })
  },
}

/**
 * The same install with nothing wired: every way in draws refused.
 */
export const NoDoors: Story = {
  name: 'An install with no cases and no doors',
  args: { cases: [] },
  play: async ({ canvas, step }) => {
    await step('every way in is still named', async () => {
      await expect(canvas.getByText('New case')).toBeVisible()
      await expect(canvas.getByText('Demo cases')).toBeVisible()
    })
    await step('and every one of them is refused rather than absent', async () => {
      const offers = canvas.getAllByRole('button')
      for (const offer of offers) await expect(offer).toBeDisabled()
    })
  },
}

/** The read has not come back. The toolbar stays; the table is a skeleton. */
export const Loading: Story = {
  name: 'The list has not arrived',
  args: { isPending: true },
  play: async ({ canvas, step }) => {
    await step('the wait is announced rather than drawn as an empty list', async () => {
      await expect(canvas.getByRole('status')).toBeInTheDocument()
    })
    await step('and no row is drawn from data nobody has', async () => {
      await expect(canvas.queryByRole('grid')).toBeNull()
    })
  },
}

/**
 * The list did not arrive.
 */
export const DidNotLoad: Story = {
  name: 'The read failed',
  args: {
    problem: 'The case list could not be read from this install.',
    onRetry: () => undefined,
  },
  play: async ({ canvas, step }) => {
    await step('the failure is stated in the body', async () => {
      await expect(canvas.getByRole('alert')).toHaveTextContent(
        'The case list could not be read from this install.',
      )
    })
    await step('and a failure that may pass is offered a retry', async () => {
      await expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible()
    })
  },
}

/**
 * A refusal, which gets no retry: the server is right and will refuse every
 * press, so the button would invite the analyst to keep pressing it.
 */
export const Refused: Story = {
  name: 'Refused, not failed',
  args: { problem: new ApiError(403, 'Your account may not read this install\u2019s cases.', null) },
  play: async ({ canvas, step }) => {
    await step('the refusal is stated calmly, not as a fault', async () => {
      await expect(canvas.queryByRole('alert')).toBeNull()
      await expect(canvas.getByRole('status')).toHaveTextContent(/may not read/)
    })
    await step('and nothing offers to try again, because it would refuse again', async () => {
      await expect(canvas.queryByRole('button', { name: 'Try again' })).toBeNull()
    })
  },
}

/**
 * The demo case only, which is what an install that has only been looked at
 * holds.
 */
export const DemoOnly: Story = {
  name: 'Only the demo case',
  args: { cases: PICKER_CASES.filter((one) => one.isDemo) },
  play: async ({ canvas, step }) => {
    await step('the roster is not empty, so the ways in are not drawn', async () => {
      await expect(canvas.queryByText('Import archive')).toBeNull()
    })
    await step('and the empty state names the narrowing that hid it', async () => {
      // The detail names *which* narrowing emptied the table rather than
      // offering to clear every filter, which would throw away decisions that
      // were fine. Matched on the exact wording: `demo` alone appears in the
      // filter row and the row itself.
      await expect(
        canvas.getByText('Drop a filter, shorten the search, or include the demo cases.'),
      ).toBeVisible()
    })
  },
}

/** A search matching nothing, with the demos still hidden. */
export const NoMatch: Story = {
  name: 'Filtered to nothing',
  args: { search: 'no case says this' },
  play: async ({ canvas, step }) => {
    await step('nothing is left', async () => {
      await expect(canvas.queryAllByRole('row').length).toBeLessThan(2)
    })
    await step('and what was typed is still on screen to be cleared', async () => {
      await expect(canvas.getByDisplayValue('no case says this')).toBeInTheDocument()
    })
  },
}
