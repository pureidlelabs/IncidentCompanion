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
 *
 * **The drawing only, never its frame.** `Canvas` supplies the border, the
 * toolbar and the legend, and this fills whatever box it is handed -- so every
 * story here mounts it in a plain sized box rather than dressing it.
 *
 * Cytoscape paints to a `<canvas>`, so nothing in the picture is a DOM node.
 * What a story can assert is what the block draws around it: the selection
 * panel, the members of a fold, and the menu. The layout itself is judged by
 * looking.
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
 *
 * The transport holds its own cursor here, as the screen does: pressing play
 * sweeps the reveal, and the strip under the track is the case's own shape.
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
 *
 * **Said in words, because a blank canvas is not an answer.** The drawing is
 * pixels rather than DOM, so an empty case, a layout that threw and a build
 * that returned early would otherwise look identical -- and only one of the
 * three is somebody's cue to go and add an event.
 *
 * The failure has its own words for the same reason, and points at the Nodes
 * list rather than at the timeline.
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
 *
 * Hover already means *isolate what this touches*, and a card over the drawing
 * covers the thing being pointed at.
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
 *
 * A reveal rather than a re-layout. Nodes arriving and pushing their
 * neighbours aside makes the drawing unlearnable, and answers a question this
 * block is not for.
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
