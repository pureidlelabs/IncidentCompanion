import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleCheck, Info, ShieldAlert, TriangleAlert } from 'lucide-react'

import { expect } from 'storybook/test'

import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert'
import { Button } from './button'

/**
 * A standing message about the surface it sits on, with an optional title,
 * action and icon.
 *
 * **The parts are placed by the alert, not by the caller.** It is a grid that
 * grows a second column when an icon is present and collapses to one when it is
 * not, and the title and the description move into that column through a
 * `has-` selector rather than through a prop. So a caller writes an icon, a
 * title and a description in that order and gets the same alignment either way.
 *
 * Everything above is a computed rectangle. A renderer without styles places
 * nothing, so the parts read as four stacked lines and every structural
 * assertion about them still passes.
 *
 * It carries `role="alert"`, so it is announced when it appears. That is for a
 * message arriving on a screen the analyst is already reading -- a standing note
 * present from the first paint is better wired as `role="status"` by the caller.
 */
const meta = {
  title: 'Components/Alert',
  component: Alert,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default tone, with a title and a description.
 *
 * The icon takes a column of its own and spans both rows, so the title and the
 * description share one left edge beside it rather than the description
 * wrapping under the icon.
 */
export const Default: Story = {
  render: () => (
    <Alert>
      <Info />
      <AlertTitle>The importer skipped four rows</AlertTitle>
      <AlertDescription>
        Each carried a timestamp the parser could not read. The case is unchanged.
      </AlertDescription>
    </Alert>
  ),
  play: async ({ canvas, step }) => {
    const alert = canvas.getByRole('alert')
    const left = (selector: string) =>
      alert.querySelector(selector)!.getBoundingClientRect().left

    await step('The icon opens a column, and the text sits in the second', async () => {
      const inset =
        alert.getBoundingClientRect().left +
        Number.parseFloat(getComputedStyle(alert).paddingLeft)
      await expect(left('[data-slot="alert-title"]')).toBeGreaterThan(inset + 8)
    })

    await step('Title and description on one edge', async () => {
      await expect(left('[data-slot="alert-title"]')).toBeCloseTo(
        left('[data-slot="alert-description"]'),
        0,
      )
    })
  },
}

/**
 * Every variant.
 *
 * The tone is carried by the ink rather than by the ground -- every alert draws
 * on `bg-card`, so a column of them reads as one surface with five kinds of
 * message on it rather than as five coloured panels. **No two tones share their
 * ink**, which is what the `play` measures: a ramp where the warning and the
 * refusal look alike does not distinguish them.
 */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Alert variant="default">
        <Info />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>A standing note about this surface.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <ShieldAlert />
        <AlertTitle>The save was refused</AlertTitle>
        <AlertDescription>Another analyst wrote this field first.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>Two entries share a timestamp</AlertTitle>
        <AlertDescription>The order in the report is not decided.</AlertDescription>
      </Alert>
      <Alert variant="info">
        <Info />
        <AlertTitle>The template supplies this section</AlertTitle>
        <AlertDescription>Edits here are kept when the template changes.</AlertDescription>
      </Alert>
      <Alert variant="success">
        <CircleCheck />
        <AlertTitle>Containment recorded</AlertTitle>
        <AlertDescription>The host was isolated at 04:31 UTC.</AlertDescription>
      </Alert>
    </div>
  ),
  play: async ({ canvas, step }) => {
    const alerts = canvas.getAllByRole('alert')

    await step('Five tones, five inks', async () => {
      const inks = alerts.map((alert) => getComputedStyle(alert).color)
      await expect(new Set(inks).size).toBe(5)
    })

    await step('And one ground under all of them', async () => {
      const grounds = alerts.map((alert) => getComputedStyle(alert).backgroundColor)
      await expect(new Set(grounds).size).toBe(1)
    })
  },
}

/**
 * `AlertAction` sits at the end of the first row.
 *
 * **It takes a column, and only when there is one.** A column declared
 * unconditionally would hold its width open in every alert without an action, so
 * the `has-` selector declares it only where there is one. The fixed band was
 * standing in for that.
 *
 * **The column is the action's own width**, so a longer label takes more room
 * rather than overhanging the text. It used to float over a fixed 72px band
 * that a `sm` button already exceeded by 24, and whether that showed depended on
 * where the description happened to wrap.
 *
 * The `play` measures the two against each other, which is the only form the
 * claim can take: the description ends where the action begins, at whatever
 * width the action turns out to be.
 */
export const WithAction: Story = {
  render: () => (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>The socket dropped</AlertTitle>
      <AlertDescription>Other analysts will not see your writes until it returns.</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline">
          Reconnect now
        </Button>
      </AlertAction>
    </Alert>
  ),
  play: async ({ canvas, step }) => {
    const alert = canvas.getByRole('alert')

    await step('The alert reserves no band of its own', async () => {
      const style = getComputedStyle(alert)
      await expect(style.paddingRight).toBe(style.paddingLeft)
    })

    await step('And the text stops where the action starts', async () => {
      const action = canvas.getByRole('button', { name: /Reconnect/ }).getBoundingClientRect()
      const description = alert
        .querySelector('[data-slot="alert-description"]')!
        .getBoundingClientRect()
      await expect(description.right).toBeLessThanOrEqual(action.left + 1)
    })

    await step('Whatever width that action turns out to be', async () => {
      const action = canvas.getByRole('button', { name: /Reconnect/ }).getBoundingClientRect()
      await expect(action.right).toBeLessThanOrEqual(alert.getBoundingClientRect().right)
    })
  },
}

/**
 * No icon: the media column collapses and the text keeps the left edge.
 *
 * The grid drops to one column, so the title starts at the alert's own padding
 * rather than at an indent left behind by an icon that is not there.
 */
export const NoIcon: Story = {
  render: () => (
    <Alert variant="destructive">
      <AlertTitle>The case could not be read</AlertTitle>
      <AlertDescription>Nothing is written while a screen is drawing.</AlertDescription>
    </Alert>
  ),
  play: async ({ canvas }) => {
    const alert = canvas.getByRole('alert')
    const style = getComputedStyle(alert)
    const inset =
      alert.getBoundingClientRect().left +
      Number.parseFloat(style.borderLeftWidth) +
      Number.parseFloat(style.paddingLeft)

    const title = alert.querySelector('[data-slot="alert-title"]')!.getBoundingClientRect()
    const content =
      alert.getBoundingClientRect().width -
      Number.parseFloat(style.borderLeftWidth) * 2 -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight)

    // The width, not only the edge: a media column left standing at a fixed
    // size holds the left edge where it was and squeezes the text into 24px.
    await expect(title.left).toBeCloseTo(inset, 0)
    await expect(title.width).toBeCloseTo(content, 0)
  },
}

/**
 * A title on its own, which is the shortest an alert gets.
 *
 * The icon still spans two rows where there is only one, so the mark sits on the
 * line rather than above it.
 */
export const TitleOnly: Story = {
  render: () => (
    <Alert variant="info">
      <Info />
      <AlertTitle>This case is read-only</AlertTitle>
    </Alert>
  ),
  play: async ({ canvas, step }) => {
    const alert = canvas.getByRole('alert')
    const box = alert.getBoundingClientRect()
    const title = alert.querySelector('[data-slot="alert-title"]')!.getBoundingClientRect()

    await step('The mark sits on the line rather than above it', async () => {
      const icon = alert.querySelector('svg')!.getBoundingClientRect()
      await expect(icon.top + icon.height / 2).toBeCloseTo(title.top + title.height / 2, -0.5)
    })

    // A grid that reserved a row for the description it does not have would
    // pass every assertion about placement and still draw a half-empty box.
    await step('And no row is held open for the description that is absent', async () => {
      const style = getComputedStyle(alert)
      const padding =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      await expect(box.height - padding).toBeLessThan(title.height * 1.5)
    })
  },
}
