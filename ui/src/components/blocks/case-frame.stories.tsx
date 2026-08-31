import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { expect } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { caseActivity, caseChrome } from '@/fixtures/caseChrome'

import { CaseFrame } from './case-frame'

/**
 * A case, framed: the rail, the header bar, and the section in the pane.
 *
 * **The one place a case's rail is composed.** `AppShell` owns the geometry and
 * knows nothing about a case, which left every caller writing the rail out --
 * two stories drew four rows each and the app drew twenty from a registry the
 * gallery could not reach. Move the rail here and every screen follows.
 *
 * What goes in the pane is the screen; these stories put a marker there,
 * because the frame is what is being judged.
 */
const meta = {
  title: 'Blocks/App shell/Case frame',
  component: CaseFrame,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function InARouter(Story) {
      return (
        <MemoryRouter initialEntries={['/timeline']}>
          <div className="h-dvh">
            <Story />
          </div>
        </MemoryRouter>
      )
    },
  ],
} satisfies Meta<typeof CaseFrame>

export default meta
type Story = StoryObj<typeof meta>

/** Stands in for a screen, so the frame is what the eye goes to. */
const Pane = (
  <div className="grid h-full place-items-center text-ink-muted">The section renders here</div>
)

/** Fixed, so a screenshot in a year holds the same reading. */
const NOW = Date.parse('2026-08-19T09:00:00.000Z')

const COUNTS = {
  timeline: campaignCase.timeline.length,
  evidence: campaignCase.evidence.length,
  entities: campaignCase.systems.length + campaignCase.accounts.length,
  impact: campaignCase.impact.length,
}

/** The rail an analyst actually meets: every group, and counts where there are any. */
export const Populated: Story = {
  name: 'A case with work in it',
  args: {
    section: 'timeline',
    ...caseChrome,
    activity: { entries: caseActivity(Math.floor(NOW / 1000)) },
    counts: COUNTS,
    children: Pane,
  },
  play: async ({ canvas, step }) => {
    await step('the rail is composed here rather than by the caller', async () => {
      // The defect this block exists against: a caller writing the rail out
      // itself drew four rows where the registry holds twenty.
      await expect(canvas.getAllByRole('link').length).toBeGreaterThan(10)
      // The frame draws the rail twice -- the desktop one and the sheet the
      // narrow layout opens -- so every row matches more than once.
      await expect(canvas.getAllByRole('link', { name: /Timeline/ }).length).toBeGreaterThan(0)
    })
    await step('a count says which section it counts', async () => {
      // The chip is a bare number on the screen, so the number and the
      // section it belongs to are only ever joined in its label.
      await expect(
        canvas.getByLabelText(`${String(COUNTS.timeline)} in Timeline`),
      ).toBeInTheDocument()
    })
    await step('and the section standing in it is the one marked', async () => {
      await expect(canvas.getAllByTestId('rail-active-edge')).toHaveLength(1)
    })
  },
}

/**
 * Standing in a child section, which is what holds its parent open.
 *
 * `assets` is reached by folding `entities`, so the group must stay open and
 * the parent row must read as holding the current section rather than being it.
 */
export const InAChildSection: Story = {
  name: 'Inside a folded group',
  args: { ...Populated.args, section: 'assets' },
  play: async ({ canvas, step }) => {
    await step('the group holding the section is open', async () => {
      // Folded, the analyst would be standing somewhere the rail does not
      // list, with no row anywhere reading as current.
      await expect(canvas.getAllByRole('link', { name: /Assets/ }).length).toBeGreaterThan(0)
    })
    await step('and the parent reads as holding it rather than being it', async () => {
      // `deferToChild`: two marked rows would say the analyst is in two
      // sections, and marking only the parent would lose the child entirely.
      await expect(canvas.getAllByTestId('rail-active-edge')).toHaveLength(1)
    })
  },
}

/**
 * A fresh case: every row present, no counts.
 *
 * The rail is the same shape whether the case is empty or not -- what changes
 * is only the chips, so an analyst never loses a section by not having used it
 * yet.
 */
export const Fresh: Story = {
  name: 'A case with nothing in it',
  args: { ...Populated.args, section: 'overview', counts: {} },
  play: async ({ canvas, step }) => {
    await step('every row is still there', async () => {
      // A rail that hid the unused sections would leave an analyst unable to
      // reach the one they have not written in yet, which is every section on
      // the first morning of a case.
      await expect(canvas.getAllByRole('link').length).toBeGreaterThan(10)
      await expect(canvas.getAllByRole('link', { name: /Timeline/ }).length).toBeGreaterThan(0)
      await expect(canvas.getAllByRole('link', { name: /Evidence/ }).length).toBeGreaterThan(0)
    })
    await step('and only the chips are gone', async () => {
      await expect(canvas.queryByLabelText(/ in Timeline$/)).toBeNull()
    })
  },
}
