import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'

import { Breadcrumb, Breadcrumbs } from './breadcrumbs'

/** The trail to where the analyst is, with the current page as plain text rather than a link. */
const meta = {
  title: 'Components/Breadcrumbs',
  component: Breadcrumbs,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Breadcrumbs<object>>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The last level is the current page: no link, no chevron, and `aria-current`.
 */
export const Default: Story = {
  render: () => (
    <nav aria-label="Breadcrumbs">
      <Breadcrumbs>
        <Breadcrumb href="#">Cases</Breadcrumb>
        <Breadcrumb href="#">INC-2481</Breadcrumb>
        <Breadcrumb>Timeline</Breadcrumb>
      </Breadcrumbs>
    </nav>
  ),
  /**
   * Every level clears the 24px target floor.
   */
  play: async ({ canvas, canvasElement, step }) => {
    const links = [...canvasElement.querySelectorAll('[data-slot="link"]')]

    await step('Every level clears the 24px target floor', async () => {
      await expect(links).toHaveLength(3)
      for (const el of links) {
        await expect(
          el.getBoundingClientRect().height,
          `"${el.textContent}" is below the 24px target floor`,
        ).toBeGreaterThanOrEqual(24)
      }
    })

    // `role="link"` stays on the last level and `href` does not: that is the
    // breadcrumb pattern, where the current page is a link marked as current
    // rather than a link taken away. So the count to read is the anchors.
    await step('Two navigate, and the last one is where you are', async () => {
      await expect(canvasElement.querySelectorAll('[data-slot="breadcrumb"] a')).toHaveLength(2)
      await expect(canvas.getByText('Timeline')).toHaveAttribute('aria-current', 'page')
      await expect(canvas.getByText('Timeline').tagName).toBe('SPAN')
    })

    await step('And nothing follows it', async () => {
      const marks = canvasElement.querySelectorAll('[data-slot="breadcrumb"] svg')
      await expect(marks).toHaveLength(2)
    })
  },
}

/**
 * `onAction` reports the pressed level's `id`, for a trail that moves a router
 * rather than following an `href`.
 */
export const WithAction: Story = {
  args: { onAction: fn() },
  render: (args) => (
    <nav aria-label="Breadcrumbs">
      <Breadcrumbs {...(args.onAction === undefined ? {} : { onAction: args.onAction })}>
        <Breadcrumb id="cases">Cases</Breadcrumb>
        <Breadcrumb id="case">INC-2481</Breadcrumb>
        <Breadcrumb id="entities">Entities</Breadcrumb>
      </Breadcrumbs>
    </nav>
  ),
  play: async ({ args, canvas }) => {
    await userEvent.click(canvas.getByText('INC-2481'))
    await expect(args.onAction).toHaveBeenCalledWith('case')
  },
}

/**
 * `isDisabled` on the list stands every level down -- the trail is still there
 * to read, and none of it navigates.
 */
export const Disabled: Story = {
  render: () => (
    <nav aria-label="Breadcrumbs">
      <Breadcrumbs isDisabled>
        <Breadcrumb href="#">Cases</Breadcrumb>
        <Breadcrumb href="#">INC-2481</Breadcrumb>
        <Breadcrumb>Report</Breadcrumb>
      </Breadcrumbs>
    </nav>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    await step('The trail still reads', async () => {
      await expect(canvas.getByText('Cases')).toBeInTheDocument()
      await expect(canvas.getByText('INC-2481')).toBeInTheDocument()
    })

    await step('And no level of it navigates', async () => {
      for (const level of canvasElement.querySelectorAll('[data-slot="link"]')) {
        await expect(level).toHaveAttribute('aria-disabled', 'true')
      }
    })
  },
}
