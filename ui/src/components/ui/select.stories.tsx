import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect, fn, screen } from 'storybook/test'

import { ListBoxItem } from './list-box'
import { Select } from './select'

interface Option {
  id: string
  name: string
}

const SEVERITIES: Option[] = [
  { id: 'critical', name: 'Critical' },
  { id: 'high', name: 'High' },
  { id: 'medium', name: 'Medium' },
  { id: 'low', name: 'Low' },
  { id: 'informational', name: 'Informational' },
]

const rows = (options: Option[]) =>
  options.map((one) => (
    <ListBoxItem key={one.id} id={one.id}>
      {one.name}
    </ListBoxItem>
  ))

/**
 * A value picked from a fixed list, reported by `id` rather than by the text
 * shown.
 *
 * That is the contract: the caller supplies rows with ids and reads an id back,
 * so renaming a row's text changes nothing stored. A list too long to scan is a
 * `ComboBox` instead -- this has no filter.
 *
 * The list is a popover, so it is not inside the trigger's own markup. A story
 * that opens one renders in its own docs frame, and a query for an option must
 * reach the whole document rather than the story's canvas.
 */
const meta = {
  title: 'Components/Select',
  component: Select,
  parameters: { layout: 'centered' },
  // `onSelectionChange` is the component's own prop, so the spy needs no story
  // arg of its own and the Controls panel drives the real thing.
  args: {
    label: 'Severity',
    placeholder: 'Not set',
    onSelectionChange: fn(),
    children: rows(SEVERITIES),
  },
  render: (args) => <Select {...args} className="w-64" />,
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Closed, with a placeholder.
 *
 * The `play` opens it, picks a row and asserts the **id** came back rather than
 * the text. A select reporting its label reads correctly on screen and stores
 * something that breaks the moment a row is renamed.
 */
export const Default: Story = {
  play: async ({ args, canvas, step, userEvent }) => {
    const trigger = canvas.getByRole('button')

    await step('It opens on the trigger', async () => {
      await userEvent.click(trigger)
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    await step('Picking a row reports its id', async () => {
      // **`screen`, not `canvas`.** The list is portalled out of the story's
      // own element, so a canvas-scoped query reports every option missing.
      const option = await screen.findByRole('option', { name: 'High' })
      await userEvent.click(option)
      await expect(args.onSelectionChange).toHaveBeenCalledWith('high')
    })

    await step('And the trigger shows the text', async () => {
      await expect(trigger).toHaveTextContent('High')
    })
  },
}

/**
 * Open, so the list and the tick are on the page.
 *
 * The keyboard is the point here: the arrows move through the rows and Enter
 * takes the focused one, so the whole control is usable without a pointer.
 */
export const Open: Story = {
  // Its own docs frame: the list is a popover, and the autodocs page renders
  // every story into one document for it to be drawn over.
  parameters: { docs: { story: { inline: false, height: '420px' } } },
  args: { defaultOpen: true, defaultSelectedKey: 'high' },
  play: async ({ args, canvas, userEvent }) => {
    await expect(await screen.findByRole('listbox')).toBeInTheDocument()

    await userEvent.keyboard('{ArrowDown}{Enter}')

    // Down from `high` is `medium`, and it is reported by id.
    await expect(args.onSelectionChange).toHaveBeenCalledWith('medium')
    await expect(canvas.getByRole('button')).toHaveTextContent('Medium')
  },
}

/** The three heights, on the `--control-h-*` scale. */
export const Sizes: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex w-64 flex-col gap-3">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <Select key={size} {...args} size={size} label={size} />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = canvas
      .getAllByRole('button')
      .map((trigger) => trigger.getBoundingClientRect().height)
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/** With a description, refused, and disabled. */
export const States: Story = {
  render: (args) => (
    <div className="flex w-64 flex-col gap-4">
      <Select {...args} description="Drives the report ordering." />
      <Select {...args} isInvalid errorMessage="Pick a severity." />
      <Select {...args} isDisabled defaultSelectedKey="low" />
    </div>
  ),
  /**
   * The refused select draws the refused border.
   *
   * **Read from the computed colour, not from the class list.** The variant
   * was there and inert for as long as this story has existed: React Aria's
   * `Button` render props carry no `isInvalid`, so `trigger()` was told the
   * select was fine however the caller had marked it. A class-list assertion
   * would have gone green on the day the variant stopped firing, because the
   * class it looks for is the one that was never applied.
   */
  play: async ({ canvasElement }) => {
    const triggers = canvasElement.querySelectorAll('button[aria-haspopup="listbox"]')
    await expect(triggers).toHaveLength(3)
    const [fine, refused] = [triggers[0]!, triggers[1]!]
    const ink = (el: Element): string => getComputedStyle(el).borderTopColor
    await expect(ink(refused)).not.toBe(ink(fine))
  },
}

/**
 * Nothing to choose from.
 *
 * The trigger still draws and still opens, so an analyst learns the list is
 * empty rather than pressing a control that appears broken. A caller with
 * nothing to offer usually wants the field hidden instead, which the caller
 * decides.
 */
export const NoOptions: Story = {
  args: { children: rows([]), placeholder: 'Nothing to choose' },
}

/**
 * A row longer than the trigger, and far more rows than fit.
 *
 * The trigger truncates rather than growing, so a select in a form keeps the
 * form's measure whatever is chosen. The list scrolls.
 */
export const Extremes: Story = {
  args: {
    children: rows([
      {
        id: 'long',
        name: 'Credential access via LSASS memory dump on the finance file server',
      },
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `host-${String(index)}`,
        name: `WS-${String(index).padStart(4, '0')}`,
      })),
    ]),
    defaultSelectedKey: 'long',
  },
}
