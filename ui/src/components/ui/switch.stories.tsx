import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { Switch } from './switch'

/**
 * A setting that takes effect the moment it moves, unlike a `Checkbox` whose
 * change applies on submit.
 */
const meta = {
  title: 'Components/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
  args: { children: 'Follow this case', size: 'md' },
  render: (args) => <Switch {...args} />,
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

/** Off, with its label, which is part of the target. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    // A switch, not a checkbox: the role decides whether a reader says "off"
    // or "not checked".
    const control = canvas.getByRole('switch', { name: 'Follow this case' })
    await expect(control).not.toBeChecked()

    await userEvent.click(canvas.getByText('Follow this case'))
    await expect(control).toBeChecked()
  },
}

/** Both sizes. */
export const Sizes: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-3">
      <Switch {...args} size="sm">
        Small
      </Switch>
      <Switch {...args} size="md">
        Medium
      </Switch>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [small, medium] = [...canvasElement.querySelectorAll('[data-slot="switch-handle"]')]
    await expect(medium!.getBoundingClientRect().width).toBeGreaterThan(
      small!.getBoundingClientRect().width,
    )
  },
}

/** Selected, at both sizes. */
export const Selected: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-3">
      <Switch {...args} size="sm" defaultSelected>
        Small, on
      </Switch>
      <Switch {...args} defaultSelected>
        Medium, on
      </Switch>
    </div>
  ),
  play: async ({ canvas }) => {
    for (const control of canvas.getAllByRole('switch')) {
      await expect(control).toBeChecked()
    }
  },
}

/**
 * **`isDisabled` takes the switch out of the tab order.**
 */
export const Disabled: Story = {
  render: ({ children: _children, ...args }) => (
    <div className="flex flex-col gap-3">
      <Switch {...args}>Before</Switch>
      <Switch {...args} isDisabled>
        Disabled, off
      </Switch>
      <Switch {...args} isDisabled defaultSelected>
        Disabled, on
      </Switch>
      <Switch {...args}>After</Switch>
    </div>
  ),
  play: async ({ canvas, step, userEvent }) => {
    await step('Both disabled switches are skipped', async () => {
      canvas.getByRole('switch', { name: 'Before' }).focus()
      await userEvent.tab()
      await expect(canvas.getByRole('switch', { name: 'After' })).toHaveFocus()
    })

    await step('And a switch that is on still reports it', async () => {
      await expect(canvas.getByRole('switch', { name: 'Disabled, on' })).toBeChecked()
    })
  },
}

/** With a description line, announced with the switch rather than read separately. */
export const WithDescription: Story = {
  args: {
    children: 'Live updates',
    description: 'Every analyst on the case sees the change at once.',
  },
  play: async ({ canvas, canvasElement }) => {
    const describedBy = canvas.getByRole('switch').getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Every analyst on the case sees the change at once.')
  },
}

/**
 * The throw.
 */
export const TheThrow: Story = {
  args: { children: 'Spring the handle' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const handle = canvasElement.querySelector('[data-slot="switch-handle"]')!
    const before = handle.getBoundingClientRect().x

    await userEvent.click(canvas.getByRole('switch'))

    await waitFor(() => {
      void expect(
        Math.abs(handle.getBoundingClientRect().x - before),
      ).toBeGreaterThan(4)
    })
  },
}
