import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { MemoryRouter } from 'react-router-dom'

import { sessionRows } from '@/fixtures/railMenus'
import { PickerFrame } from './picker-frame'
import { Section } from './section'

/**
 * The picker's rail and header, with a stand-in where a pane goes.
 *
 * The sibling of `Case frame`: judge the assembled picker on the pane screens,
 * and the frame here.
 *
 * **The wait and the failure are drawn here rather than on eleven screens.**
 * Every picker screen hands `busy`, `problem` and `onRetry` straight through to
 * one boundary, so what each screen would show is this. `Async boundary` owns
 * what those states look like -- the skeleton, the calm 403, the missing retry;
 * what this file owes is the half only the frame has, which is that the rail
 * outlives them both.
 */
const meta = {
  title: 'Blocks/App shell/Picker frame',
  component: PickerFrame,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="h-dvh">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    pane: 'cases',
    analyst: 'r.okonkwo',
    userMenu: sessionRows,
    onAbout: fn(),
    onPane: fn(),
    children: (
      <Section title="A pane" blurb="Whatever the rail's current row draws.">
        <div className="grid h-64 place-items-center rounded-md border border-dashed border-border font-mono text-xs text-ink-muted">
          children
        </div>
      </Section>
    ),
  },
} satisfies Meta<typeof PickerFrame>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Standing in the cases pane, which is where an analyst lands.
 *
 * One row is lit and the group holding it is open. The rail is the whole of
 * this frame's navigation, so a pane that could not be told from its
 * neighbours would leave an analyst with no way to know where they are.
 */
export const OnCases: Story = {
  name: 'On the cases pane',
  play: async ({ canvas, step }) => {
    await step('the current row is marked, and only it', async () => {
      await expect(canvas.getByTestId('picker-row-cases')).toHaveAttribute(
        'data-active',
        'true',
      )
      await expect(canvas.getByTestId('picker-row-demos')).not.toHaveAttribute(
        'data-active',
        'true',
      )
    })
  },
}

/**
 * A pane in another group, so a second group reads as current.
 *
 * A group holding the current row is forced open however it was last folded,
 * which is what stops an analyst losing sight of where they are after
 * collapsing a section they were not using.
 */
export const OnAdministration: Story = {
  name: 'On a system pane',
  args: { pane: 'administration' },
  play: async ({ canvas, step }) => {
    await step('the row in the other group is the lit one', async () => {
      await expect(canvas.getByTestId('picker-row-administration')).toHaveAttribute(
        'data-active',
        'true',
      )
    })
    await step('and its group is open, so the row is reachable', async () => {
      await expect(canvas.getByTestId('picker-row-health')).toBeVisible()
    })
  },
}

/**
 * The top card's row, which is a destination rather than a door.
 *
 * `Import archive` sits beside it and passes no `active`, so it can never read
 * as current: it opens a dialog over whichever pane is showing, and there is no
 * pane here for it to land on.
 */
export const OnNewCase: Story = {
  name: 'On New case',
  args: { pane: 'new' },
  play: async ({ canvas, step }) => {
    await step('New case is lit', async () => {
      await expect(canvas.getByTestId('picker-row-new')).toHaveAttribute('data-active', 'true')
    })
    await step('and the door beside it is not, having nowhere to be current', async () => {
      const door = canvas.getByRole('button', { name: /Import archive/ })
      await expect(door).not.toHaveAttribute('data-active', 'true')
    })
  },
}

/**
 * The pane's read is still running.
 *
 * **The rail stays.** It was answered before the pane was asked for, and it is
 * how somebody leaves a pane that is taking too long -- so withholding it along
 * with the body would trap an analyst in front of the one thing that is slow.
 *
 * What the wait itself looks like belongs to `Async boundary`.
 */
export const Reading: Story = {
  name: 'The pane is still being read',
  args: { busy: true },
  play: async ({ canvas, step }) => {
    await step('the pane is withheld rather than drawn empty', async () => {
      await expect(canvas.queryByText('children')).toBeNull()
      await expect(canvas.getByRole('status')).toBeInTheDocument()
    })
    await step('and every other destination is still there to leave by', async () => {
      await expect(canvas.getByTestId('picker-row-health')).toBeVisible()
      await expect(canvas.getByTestId('picker-row-new')).toBeVisible()
    })
  },
}

/**
 * The pane's read failed.
 *
 * **Drawn in the pane, never over the screen.** This is the first screen after
 * sign-in and there is nothing behind it, so an overlay would leave an analyst
 * with one control and no way past it. Ten other destinations are a better
 * recovery than any retry, and they are all still on the left.
 */
export const Refused: Story = {
  name: 'The pane failed to load',
  args: {
    problem: new Error('The install could not be read.'),
    onRetry: fn(),
  },
  play: async ({ canvas, step }) => {
    await step('the failure is stated where the pane would be', async () => {
      await expect(canvas.getByRole('alert')).toHaveTextContent(
        'The install could not be read.',
      )
      await expect(canvas.queryByText('children')).toBeNull()
    })
    await step('the rail is untouched, so leaving is the cheaper recovery', async () => {
      await expect(canvas.getByTestId('picker-row-demos')).toBeVisible()
      await expect(canvas.getByTestId('picker-row-accounts')).toBeVisible()
    })
    await step('and the analyst at the foot is still named', async () => {
      await expect(canvas.getByText('r.okonkwo')).toBeVisible()
    })
  },
}
