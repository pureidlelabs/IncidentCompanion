import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Button } from './button'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from './frame'

/**
 * A bordered card with a tinted header, for a titled block of content in a
 * pane.
 *
 * **Most of what these stories show is appearance and carries no assertion**:
 * the two variants, the three spacing steps, the rule between stacked panels,
 * and the radius stepping down when frames nest. A story pinning any of them
 * would fail on a frame that is working.
 *
 * **What is structural is the title, and it is what is wrong.** `FrameTitle`
 * is a `div`: it reads as a heading to somebody looking at it and as nothing
 * at all to somebody listening, and heading navigation is how a screen-reader
 * user crosses a page of cards. The level is not the same in every caller and
 * frames nest, so the fix is a decision rather than an edit. -> issue 17
 */
const meta = {
  title: 'Components/Frame',
  component: Frame,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Frame>

export default meta
type Story = StoryObj<typeof meta>

/** The default: a bordered card with a tinted header. */
export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    // The title and the line under it are both drawn, and neither is a
    // heading. Asserted as it stands rather than as it should be, so the
    // day somebody makes the title a heading this goes red and points at
    // the decision. -> issue 17
    await expect(canvas.getByText('Retention')).toBeVisible()
    await expect(canvas.getByText('How long a closed case stays on disk.')).toBeVisible()
    await expect(canvas.queryByRole('heading')).toBeNull()

    // The description is inside the header with the title rather than in the
    // panel, so the two read as one band above the content.
    const header = canvasElement.querySelector('header')!
    await expect(header.textContent).toContain('Retention')
    await expect(header.textContent).toContain('How long a closed case stays on disk.')
  },
  render: () => (
    <Frame className="w-96">
      <FrameHeader>
        <FrameTitle>Retention</FrameTitle>
        <FrameDescription>How long a closed case stays on disk.</FrameDescription>
      </FrameHeader>
      <FramePanel>
        <p className="text-sm text-ink-muted">
          Closed cases are kept for 180 days, then archived.
        </p>
      </FramePanel>
    </Frame>
  ),
}

/** Both variants. `ghost` drops the border for a frame already inside one. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Frame variant="default" className="w-96">
        <FrameHeader>
          <FrameTitle>Default</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-ink-muted">Bordered, with a lift.</p>
        </FramePanel>
      </Frame>
      <Frame variant="ghost" className="w-96">
        <FrameHeader>
          <FrameTitle>Ghost</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-ink-muted">No border and no lift.</p>
        </FramePanel>
      </Frame>
    </div>
  ),
}

/** Every spacing step, moving the header and the panel together. */
export const Spacing: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Frame spacing="sm" className="w-96">
        <FrameHeader>
          <FrameTitle>Small</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-ink-muted">Tight.</p>
        </FramePanel>
      </Frame>
      <Frame spacing="default" className="w-96">
        <FrameHeader>
          <FrameTitle>Default</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-ink-muted">The usual.</p>
        </FramePanel>
      </Frame>
      <Frame spacing="lg" className="w-96">
        <FrameHeader>
          <FrameTitle>Large</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-ink-muted">Roomy.</p>
        </FramePanel>
      </Frame>
    </div>
  ),
}

/** Two panels stack with a rule between them. */
export const StackedPanels: Story = {
  play: async ({ canvasElement }) => {
    // Three panels under one header: the card is one titled block whatever
    // it is divided into, so the header is not repeated per panel.
    await expect(canvasElement.querySelectorAll('[data-slot="frame-panel"]')).toHaveLength(3)
    await expect(canvasElement.querySelectorAll('header')).toHaveLength(1)
  },
  render: () => (
    <Frame className="w-96">
      <FrameHeader>
        <FrameTitle>Notifications</FrameTitle>
        <FrameDescription>Who hears about a change, and when.</FrameDescription>
      </FrameHeader>
      <FramePanel>
        <p className="text-sm text-ink-muted">Mention me in a report.</p>
      </FramePanel>
      <FramePanel>
        <p className="text-sm text-ink-muted">A case I claimed is reassigned.</p>
      </FramePanel>
      <FramePanel>
        <Button size="sm" variant="outline">
          Edit notifications
        </Button>
      </FramePanel>
    </Frame>
  ),
}

/**
 * A frame holding two frames.
 *
 * The nested pair keeps the border and loses the lift, and the radius steps
 * down from `rounded-xl` to `rounded-lg`, so the inner cards read as held
 * rather than as a second layer of the same card.
 */
export const FramesInFrames: Story = {
  name: 'Frames in frames',
  play: async ({ canvasElement }) => {
    // Frames nest, so the title's heading level cannot be a constant: an
    // inner card sits under an outer one, and a fixed level puts a heading
    // inside a heading of its own rank. -> issue 17
    const frames = canvasElement.querySelectorAll('[data-slot="frame"]')
    await expect(frames.length).toBeGreaterThan(1)
    await expect(frames[0]!.contains(frames[1]!)).toBe(true)
  },
  render: () => (
    <Frame className="w-[36rem]">
      <FrameHeader>
        <FrameTitle>Containment</FrameTitle>
        <FrameDescription>What was cut off, and what is still reachable.</FrameDescription>
      </FrameHeader>
      <FramePanel>
        <div className="grid grid-cols-2 gap-4">
          <Frame spacing="sm">
            <FrameHeader>
              <FrameTitle>Isolated</FrameTitle>
            </FrameHeader>
            <FramePanel>
              <p className="text-sm text-ink-muted">PC-4417, PC-2210</p>
            </FramePanel>
          </Frame>
          <Frame spacing="sm">
            <FrameHeader>
              <FrameTitle>Still reachable</FrameTitle>
            </FrameHeader>
            <FramePanel>
              <p className="text-sm text-ink-muted">SRV-DC-01</p>
            </FramePanel>
          </Frame>
        </div>
      </FramePanel>
    </Frame>
  ),
}

/**
 * A header over a framed list.
 *
 * The panel takes `padding="none"`, so the list meets the frame's own edge
 * instead of sitting in a moat of two paddings; each row is a `ghost` frame,
 * which is the variant for a frame already inside one.
 */
export const FramedList: Story = {
  name: 'A header over a framed list',
  render: () => (
    <Frame className="w-96">
      <FrameHeader>
        <FrameTitle>Systems</FrameTitle>
        <FrameDescription>Hosts touched by this incident.</FrameDescription>
      </FrameHeader>
      <FramePanel padding="none">
        <div className="divide-y divide-border">
          {[
            { host: 'PC-4417', note: 'desktop, isolated' },
            { host: 'SRV-DC-01', note: 'domain controller' },
            { host: 'FW-EDGE-02', note: 'firewall' },
          ].map((row) => (
            <Frame key={row.host} variant="ghost" spacing="sm">
              <FramePanel className="flex items-center justify-between">
                <span className="text-sm">{row.host}</span>
                <span className="text-xs text-ink-muted">{row.note}</span>
              </FramePanel>
            </Frame>
          ))}
        </div>
      </FramePanel>
    </Frame>
  ),
}

/**
 * Three deep, one spacing step tighter at every level.
 *
 * `spacing` is per frame rather than inherited, so a nested frame that is not
 * given one keeps the default and reads wider than its parent.
 */
export const NestedSpacing: Story = {
  name: 'Nesting at each spacing',
  render: () => (
    <Frame spacing="lg" className="w-[32rem]">
      <FrameHeader>
        <FrameTitle>Large</FrameTitle>
      </FrameHeader>
      <FramePanel>
        <Frame spacing="default">
          <FrameHeader>
            <FrameTitle>Default</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <Frame spacing="sm">
              <FrameHeader>
                <FrameTitle>Small</FrameTitle>
              </FrameHeader>
              <FramePanel>
                <p className="text-sm text-ink-muted">
                  The innermost body. Three borders, three radii, one lift.
                </p>
              </FramePanel>
            </Frame>
          </FramePanel>
        </Frame>
      </FramePanel>
    </Frame>
  ),
}

/**
 * The same nesting with `ghost` inside `default`, which is what to reach for
 * when the inner frames are sections of one card rather than cards of their
 * own. A `ghost` header still draws its rule, so the sections stay separated
 * without a second border around each.
 */
export const GhostSections: Story = {
  name: 'Ghost frames as sections',
  render: () => (
    <Frame className="w-96">
      <FrameHeader>
        <FrameTitle>Report</FrameTitle>
      </FrameHeader>
      <FramePanel padding="none">
        <Frame variant="ghost">
          <FrameHeader>
            <FrameTitle>Summary</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <p className="text-sm text-ink-muted">Two paragraphs, unwritten.</p>
          </FramePanel>
        </Frame>
        <Frame variant="ghost">
          <FrameHeader>
            <FrameTitle>Kill chain</FrameTitle>
          </FrameHeader>
          <FramePanel>
            <p className="text-sm text-ink-muted">Seven steps, five evidenced.</p>
          </FramePanel>
        </Frame>
      </FramePanel>
    </Frame>
  ),
}
