import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, waitFor } from 'storybook/test'

import { ComboBox } from './combobox'
import { ListBoxItem } from './list-box'

interface Option {
  id: string
  name: string
}

const TACTICS: Option[] = [
  { id: 'initial-access', name: 'Initial access' },
  { id: 'execution', name: 'Execution' },
  { id: 'persistence', name: 'Persistence' },
  { id: 'privilege-escalation', name: 'Privilege escalation' },
  { id: 'defense-evasion', name: 'Defence evasion' },
  { id: 'exfiltration', name: 'Exfiltration' },
]

/** The rows, as `ListBoxItem` children. */
const rows = (options: Option[]) =>
  options.map((one) => (
    <ListBoxItem key={one.id} id={one.id}>
      {one.name}
    </ListBoxItem>
  ))

/**
 * A text field that filters a list, for a choice too long to scan as a
 * `Select`.
 */
const meta = {
  title: 'Components/ComboBox',
  component: ComboBox,
  parameters: { layout: 'centered' },
  // `onSelectionChange` is the component's own prop, so the spy needs no story
  // arg of its own and the Controls panel drives the real thing.
  args: {
    label: 'Tactic',
    placeholder: 'Search tactics',
    onSelectionChange: fn(),
    children: rows(TACTICS),
  },
  render: (args) => <ComboBox {...args} className="w-72" />,
} satisfies Meta<typeof ComboBox>

export default meta
type Story = StoryObj<typeof meta>

/** Closed, with a placeholder. */
export const Default: Story = {}

/**
 * **Typing narrows the list**, which is the reason to reach for this rather
 * than a `Select`.
 */
export const TypingFilters: Story = {
  play: async ({ args, canvas, step, userEvent }) => {
    const box = canvas.getByRole('combobox', { name: 'Tactic' })

    await step('Three letters leave one row', async () => {
      await userEvent.type(box, 'exf')
      await waitFor(async () => {
        await expect(screen.getByRole('option', { name: 'Exfiltration' })).toBeInTheDocument()
      })
      await expect(screen.queryByRole('option', { name: 'Execution' })).not.toBeInTheDocument()
      await expect(screen.queryByRole('option', { name: 'Persistence' })).not.toBeInTheDocument()
    })

    await step('And picking it reports the id', async () => {
      await userEvent.click(screen.getByRole('option', { name: 'Exfiltration' }))
      await expect(args.onSelectionChange).toHaveBeenCalledWith('exfiltration')
    })
  },
}

/**
 * A query matching nothing.
 */
export const NothingMatches: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole('combobox', { name: 'Tactic' }), 'zzz')

    await waitFor(async () => {
      await expect(screen.queryByRole('option')).not.toBeInTheDocument()
    })
  },
}

/** Open on the full list, which is what focus alone gives. */
export const Open: Story = {
  parameters: { docs: { story: { inline: false, height: '420px' } } },
  args: { defaultInputValue: '', menuTrigger: 'focus' },
}

/** The three heights. */
export const Sizes: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex w-72 flex-col gap-3">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <ComboBox key={size} {...args} size={size} label={size} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const heights = [...canvasElement.querySelectorAll('[data-slot="field-group"]')].map(
      (group) => group.getBoundingClientRect().height,
    )
    await expect(heights).toHaveLength(3)
    for (let index = 1; index < heights.length; index += 1) {
      await expect(heights[index]!).toBeGreaterThan(heights[index - 1]!)
    }
  },
}

/** With a description, refused, and disabled. */
export const States: Story = {
  render: (args) => (
    <div className="flex w-72 flex-col gap-4">
      <ComboBox {...args} description="ATT&CK tactic, not technique." />
      <ComboBox {...args} isInvalid errorMessage="Pick a tactic." />
      <ComboBox {...args} isDisabled defaultSelectedKey="execution" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // The refused field draws a different edge from the one beside it. Read
    // from the computed colour rather than the class list, for the reason
    // `Select`'s own story records: a variant can be present and inert.
    const groups = [...canvasElement.querySelectorAll('[data-slot="field-group"]')]
    await expect(groups).toHaveLength(3)
    const ink = (el: Element): string => getComputedStyle(el).borderTopColor
    await expect(ink(groups[1]!)).not.toBe(ink(groups[0]!))
  },
}

/**
 * Far more rows than fit, and one longer than the field.
 */
export const Extremes: Story = {
  args: {
    children: rows([
      {
        id: 'long',
        name: 'Credential access via LSASS memory dump on the finance file server',
      },
      ...Array.from({ length: 200 }, (_, index) => ({
        id: `t-${String(index)}`,
        name: `Technique ${String(index).padStart(4, '0')}`,
      })),
    ]),
  },
}
