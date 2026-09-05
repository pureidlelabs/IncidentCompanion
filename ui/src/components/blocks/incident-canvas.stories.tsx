import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { IncidentCanvas } from './incident-canvas'
import { buildIncidentGraph, type IncidentNode } from './incident-graph'

/**
 * The case's events drawn by a force solver, with the entities each one names
 * hanging off it.
 */
const meta = {
  title: 'Blocks/Layout/Incident canvas',
  component: IncidentCanvas,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // **A flex column with a height.** The block fills the box it is given
      // -- `flex-1` against a parent that is not a flex container resolves to
      // nothing, and the pane collapses under a border that looks correct.
      <div className="flex h-[560px] w-full flex-col p-2">
        <Story />
      </div>
    ),
  ],
  args: {
    graph: buildIncidentGraph(campaignCase, specsFixture),
    specs: specsFixture,
    expanded: new Set<string>(),
    onToggleGroup: () => undefined,
    onSelect: () => undefined,
    picked: null,
    cursor: null,
    onCursor: () => undefined,
  },
} satisfies Meta<typeof IncidentCanvas>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The whole campaign, laid out and fitted to the pane.
 */
export const Populated: Story = {
  name: 'The whole case',
  render: (args) => {
    function Playing() {
      const [cursor, setCursor] = useState<number | null>(null)
      return <IncidentCanvas {...args} cursor={cursor} onCursor={setCursor} />
    }
    return <Playing />
  },
  play: async ({ canvasElement }) => {
    // The engine's own box is the handle: the drawing inside it is pixels, so
    // a story waiting for a node would wait for something that never enters
    // the DOM.
    await waitFor(() => {
      void expect(canvasElement.querySelector('[data-slot="graph-canvas"]')).not.toBeNull()
    })
  },
}

/**
 * A case with nothing in it.
 */
export const Empty: Story = {
  name: 'A case with no events',
  args: {
    graph: buildIncidentGraph(
      { ...campaignCase, timeline: [] },
      specsFixture,
    ),
  },
  play: async ({ canvas, step }) => {
    await step('the block says there is nothing to draw', async () => {
      await expect(
        canvas.getByText(/Nothing to draw yet\. A case gets a graph once/),
      ).toBeVisible()
    })
    await step('and says what would fill it, not merely that it is empty', async () => {
      await expect(canvas.getByText(/its timeline has\s+entries/)).toBeVisible()
    })
    await step('the failure`s own words are not what is shown', async () => {
      await expect(canvas.queryByText(/could not be drawn/)).toBeNull()
    })
  },
}

/**
 * A node picked, which docks the panel rather than floating a card.
 */
export const Picked: Story = {
  name: 'A node selected',
  render: (args) => {
    function Selecting() {
      const first = args.graph.nodes.find((node) => node.kind !== 'event')
      const [picked, setPicked] = useState<IncidentNode | null>(first ?? null)
      return <IncidentCanvas {...args} picked={picked} onSelect={setPicked} />
    }
    return <Selecting />
  },
}

/**
 * The incident partway through: everything first seen after the cursor is
 * dimmed, and nothing moves.
 */
export const PartwayThrough: Story = {
  name: 'Held at a moment',
  args: {
    cursor:
      Math.min(
        ...buildIncidentGraph(campaignCase, specsFixture)
          .nodes.map((node) => node.seen)
          .filter((at) => Number.isFinite(at) && at > 0),
      ) + 45 * 60_000,
  },
}
