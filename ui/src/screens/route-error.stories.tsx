import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { RouteErrorScreen, SectionErrorScreen } from './route-error'

/**
 * The screen an analyst sees when a screen stops rendering.
 *
 * **It had no story until now, which is the worst place for that gap to be**:
 * this is the surface that only appears when something has already gone
 * wrong, so nobody sees it on purpose and nothing was checking it. It also
 * drew with the tier being replaced until it moved here.
 *
 * The stack is a `<details>` rather than a state hook, because this has to
 * render when the failure is React itself.
 */
const meta = {
  title: 'Screens/System/Error',
  component: RouteErrorScreen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RouteErrorScreen>

export default meta
type Story = StoryObj<typeof meta>

const STACK = `TypeError: Cannot read properties of undefined (reading 'severity')
    at TimelineRow (timeline-row.tsx:88:21)
    at renderWithHooks (react-dom.development.js:15486:18)`

/**
 * The whole window: the shell itself could not draw, so the rail is gone.
 *
 * The first line answers the question an analyst actually has mid-incident --
 * *did I just lose the case?* -- before it offers anything.
 */
export const WholeScreen: Story = {
  name: 'The shell stopped rendering',
  args: {
    detail: "Cannot read properties of undefined (reading 'severity')",
    stack: STACK,
    onCases: fn(),
    onReload: fn(),
  },
  play: async ({ canvas, step }) => {
    await step('it answers the question an analyst has mid-incident', async () => {
      // *Did I just lose the case?* -- before anything is offered.
      await expect(canvas.getByText(/The case is untouched/)).toBeVisible()
    })
    await step('and both ways out are offered, the shell being gone', async () => {
      await expect(canvas.getByRole('button', { name: 'Back to your cases' })).toBeVisible()
      await expect(canvas.getByRole('button', { name: 'Reload' })).toBeVisible()
    })
  },
}

/**
 * A loader's 404 is not a crash and says something else.
 *
 * Nothing threw: the address is simply wrong, so *the case is untouched* would
 * be answering a question nobody asked.
 */
export const NotFound: Story = {
  name: 'Nothing at this address',
  args: { detail: '404 Not Found', notFound: true, onCases: fn(), onReload: fn() },
  play: async ({ canvas, step }) => {
    await step('it says the address is wrong rather than that something broke', async () => {
      await expect(canvas.getByText('There is nothing at this address')).toBeVisible()
      await expect(canvas.getByText(/older version of the app/)).toBeVisible()
    })
    await step('and does not reassure about a case nothing touched', async () => {
      // Nothing threw here, so *the case is untouched* would be answering a
      // question nobody asked -- and raising one they had not thought of.
      await expect(canvas.queryByText(/The case is untouched/)).toBeNull()
    })
  },
}

/**
 * The account may not open this, which is neither a crash nor a wrong address.
 *
 * **A refusal is not a failure, and offering to retry one is a lie.** The
 * server is right and will refuse every press, so *Reload* would invite an
 * analyst to keep pressing a control that keeps failing -- and *the case is
 * untouched* answers a question nobody asked, because nothing was touched or
 * broken. `Async boundary` reaches the same conclusion for a refused read.
 *
 * **403 only.** A 401 is a session that has gone, which signing in fixes, and
 * a 404 may be a case somebody renamed. Those can change by trying again.
 *
 * The way out stays: another case is one an analyst may well be allowed.
 */
export const NoAccess: Story = {
  name: 'Not allowed to open this',
  args: { detail: '403 Forbidden', refused: true, onCases: fn(), onReload: fn() },
  play: async ({ canvas, step }) => {
    await step('it says who may not, rather than that something broke', async () => {
      await expect(canvas.getByText('You may not open this')).toBeVisible()
      await expect(canvas.queryByText('This screen stopped rendering')).toBeNull()
    })
    await step('and does not reassure about a case nothing touched', async () => {
      await expect(canvas.queryByText(/The case is untouched/)).toBeNull()
    })
    await step('reloading is not offered, because it would refuse again', async () => {
      await expect(canvas.queryByRole('button', { name: 'Reload' })).toBeNull()
    })
    await step('but the way out is, since another case may well be allowed', async () => {
      await expect(canvas.getByRole('button', { name: 'Back to your cases' })).toBeVisible()
    })
  },
}

/**
 * The same failure inside the shell, where the rail survived.
 *
 * **No *back to your cases*, and that is the design rather than an omission.**
 * The analyst is already in the case and every other section still works, so
 * the offer that helps is the rail they can already see.
 */
export const InsideTheShell: Story = {
  name: 'One section stopped rendering',
  args: { detail: 'Boom', stack: STACK, onReload: fn() },
  render: (args) => <SectionErrorScreen {...args} />,
  play: async ({ canvas, step }) => {
    await step('it names the section rather than the whole screen', async () => {
      // One part died, not the app. Saying "screen" here would tell an analyst
      // mid-incident that they had lost more than they had.
      await expect(canvas.getByText('This section stopped rendering')).toBeVisible()
      await expect(canvas.queryByText('This screen stopped rendering')).toBeNull()
    })
    await step('it points at the rail rather than out of the case', async () => {
      // The analyst is already in the case and every other section works, so
      // the offer that helps is the rail they can already see.
      await expect(canvas.getByText(/pick another section from the rail/)).toBeVisible()
      await expect(canvas.queryByRole('button', { name: 'Back to your cases' })).toBeNull()
    })
    await step('and the reload it offers is the case, not the window', async () => {
      await expect(canvas.getByRole('button', { name: 'Reload this case' })).toBeVisible()
    })
  },
}

/**
 * The detail is folded, and opening it is what a bug report is pasted from.
 *
 * A stack trace as the first thing on screen is not communication; one that
 * cannot be reached at all is a defect nobody can report.
 */
export const DetailUnfolds: Story = {
  name: 'The stack, unfolded',
  args: { detail: 'Boom', stack: STACK, onCases: fn(), onReload: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('What went wrong'))
    await expect(canvas.getByText(/TimelineRow/)).toBeInTheDocument()
  },
}

/**
 * Both offers are drawn only when the caller supplies them.
 *
 * A control that is present and inert is worse than one that is absent: it
 * spends an analyst's attention mid-incident and answers nothing.
 */
export const NoWayOut: Story = {
  name: 'With nowhere to send them',
  args: { detail: 'Boom' },
  play: async ({ canvas, step }) => {
    await step('neither offer is drawn', async () => {
      await expect(canvas.queryByRole('button', { name: 'Back to your cases' })).toBeNull()
      await expect(canvas.queryByRole('button', { name: 'Reload' })).toBeNull()
    })
    await step('and the screen still says what happened', async () => {
      await expect(canvas.getByText('This screen stopped rendering')).toBeVisible()
    })
  },
}
