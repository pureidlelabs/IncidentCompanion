import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { expect, fn } from 'storybook/test'

import { ChoicePicker, type Choice } from '@/components/blocks/choice-row'

const TEMPLATES: Choice[] = [
  {
    title: 'Ransomware',
    detail: 'Encryption, extortion and recovery.',
    icon: FileText,
    chip: 'Built in',
    value: 'ransomware',
  },
  {
    title: 'Business email compromise',
    detail: 'Mailbox rules, forwarding and payment fraud.',
    icon: FileText,
    chip: 'Built in',
    value: 'bec',
  },
  {
    title: 'Blank',
    detail: 'No sections, no prompts.',
    icon: FileText,
    value: 'blank',
  },
]

/**
 * The same cards as a pick-one: choose a template, and it stays chosen.
 *
 * **It is a radio group, and the cards take no tab stop of their own.** The
 * keyboard path is the group's -- one stop in, arrows between -- because a
 * grid of cards that each took a stop would be as many stops as templates.
 *
 * `label` names the set for a screen reader; the visible heading belongs to
 * whatever draws the picker, since only that knows what it is choosing.
 */
const meta = {
  title: 'Blocks/Card/Choice picker',
  component: ChoicePicker,
  parameters: { layout: 'padded' },
  args: { choices: TEMPLATES, label: 'Case template', onValueChange: fn() },
  render: function Picker(args) {
    const [value, setValue] = useState(args.value)
    return (
      <ChoicePicker
        {...args}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          args.onValueChange(next)
        }}
      />
    )
  },
} satisfies Meta<typeof ChoicePicker>

export default meta
type Story = StoryObj<typeof meta>

/**
 * One of the set is chosen, and choosing another moves it.
 *
 * The chosen value is the choice's `value`, not its title: a template renamed
 * in the interface keeps whatever the case was started from.
 */
export const Picking: Story = {
  name: 'A picker \u2014 one of the set is chosen',
  args: { value: 'ransomware' },
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByRole('radiogroup', { name: 'Case template' })).toBeVisible()
    await expect(canvas.getByRole('radio', { name: /ransomware/i })).toBeChecked()

    await userEvent.click(canvas.getByRole('radio', { name: /business email compromise/i }))

    await expect(args.onValueChange).toHaveBeenCalledWith('bec')
    await expect(canvas.getByRole('radio', { name: /business email compromise/i })).toBeChecked()
    await expect(canvas.getByRole('radio', { name: /ransomware/i })).not.toBeChecked()
  },
}

/**
 * The same picker at two columns, for a narrower column than three fit
 * across.
 */
export const PickingAcrossTwo: Story = {
  name: 'The picker at two columns',
  args: { value: 'blank', columns: 2 },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: /blank/i })).toBeChecked()
    await expect(canvas.getAllByRole('radio')).toHaveLength(TEMPLATES.length)
  },
}

/**
 * The keyboard path is the group's own: one stop in, then the arrows.
 *
 * A card carrying its own tab stop would make a three-template picker three
 * stops and a twenty-template picker twenty.
 */
export const TheKeyboardPath: Story = {
  name: 'One tab stop in, arrows between',
  args: { value: 'ransomware' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab()
    await expect(canvas.getByRole('radio', { name: /ransomware/i })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    await expect(canvas.getByRole('radio', { name: /business email compromise/i })).toBeChecked()
  },
}

/**
 * More templates than an install would ship with.
 *
 * The group stays one tab stop however many cards are in it, which is the
 * property that does not survive a grid of individually focusable tiles.
 */
export const TooMuchData: Story = {
  name: 'Sixty templates',
  args: {
    value: 'tpl-0',
    choices: Array.from({ length: 60 }, (_, i) => ({
      title: `Template ${String(i)}`,
      detail: 'Encryption, extortion and recovery.',
      icon: FileText,
      value: `tpl-${String(i)}`,
    })),
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getAllByRole('radio')).toHaveLength(60)

    // One stop in, whatever the count: sixty cards are not sixty tab stops.
    await userEvent.tab()
    await expect(canvas.getByRole('radio', { name: /template 0/i })).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.queryByRole('radio', { name: /template 1$/i })).not.toHaveFocus()
  },
}
