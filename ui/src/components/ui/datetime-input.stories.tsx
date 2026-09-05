import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'

import { DateTimeInput } from './datetime-input'

/**
 * The stamp pair every timeline entry is recorded at: a date box, a time box,
 * a calendar behind the date, and `UTC` said in words.
 */
const meta = {
  title: 'Components/DateTimeInput',
  component: DateTimeInput,
  parameters: { layout: 'padded' },
  // The pair reports one ISO string up, so every story drives the `Live`
  // harness below rather than the component. These satisfy the type and reach
  // nothing.
  args: { label: 'Occurred', value: '', onChange: () => undefined },
} satisfies Meta<typeof DateTimeInput>

export default meta
type Story = StoryObj<typeof meta>

/** A harness, because the pair reports one ISO string back up. */
function Live({ start = '', width, disabled = false }: { start?: string; width?: number; disabled?: boolean }) {
  const [value, setValue] = useState(start)
  return (
    <div style={width === undefined ? undefined : { width }}>
      <DateTimeInput label="Occurred" value={value} onChange={setValue} disabled={disabled} />
      <p className="mt-2 font-mono text-2xs text-ink-muted">
        stored: {value === '' ? '(nothing)' : value}
      </p>
    </div>
  )
}

/** Empty. The calendar opens on today rather than on epoch. */
export const Empty: Story = {
  render: () => <Live />,
  play: async ({ canvas }) => {
    // Two boxes and nothing stored. The pair reports one ISO string up, so an
    // empty half has to mean nothing committed rather than a stamp built from
    // the half that was filled in.
    await expect(canvas.getByText('(nothing)', { exact: false })).toBeVisible()

    // `UTC` in words, because a stamp with no zone on it is read as local by
    // whoever is looking, and an incident is reconstructed across zones.
    await expect(canvas.getByText('UTC')).toBeVisible()
  },
}

/** Both halves parsed, so the pair has committed a stamp. */
export const Filled: Story = {
  render: () => <Live start="2026-08-20T14:32:00Z" />,
  play: async ({ canvas }) => {
    // Both halves drawn from the one stored string, which is what says the
    // split is a display of the value rather than two values of its own.
    await expect(canvas.getByDisplayValue('2026-08-20')).toBeVisible()
    await expect(canvas.getByDisplayValue('14:32')).toBeVisible()
    await expect(canvas.getByText(/2026-08-20T14:32/)).toBeVisible()
  },
}

/**
 * The date typed and the time not. Nothing is stored yet, and the boxes keep
 * what was typed -- type into either to watch the stamp appear.
 */
export const HalfTyped: Story = {
  render: () => {
    const Rendered = () => {
      const [value, setValue] = useState('')
      return (
        <div>
          <DateTimeInput
            key="half"
            label="Occurred"
            value={value}
            onChange={setValue}
          />
          {/* What was committed, which is the whole subject of this story: a
              box with text in it and nothing stored. Without it on screen the
              two states look identical. */}
          <p className="mt-2 font-mono text-2xs text-ink-muted">
            stored: {value === '' ? '(nothing)' : value}
          </p>
          <p className="mt-2 max-w-80 text-xs text-ink-muted">
            Type a date and leave the time empty: nothing commits until both halves parse.
            Picking a day from the calendar defaults the time to 00:00, because picking a
            day is a statement about the day.
          </p>
        </div>
      )
    }
    return <Rendered />
  },
  play: async ({ canvas, step }) => {
    const date = canvas.getAllByRole('textbox')[0]!

    await step('the date box keeps what was typed', async () => {
      // A controlled input cannot be typed into halfway: `joinIso` answers
      // `''` until both halves parse, so driving the boxes from `value` alone
      // clears the date on the fourth keystroke of `2026`.
      await userEvent.type(date, '2026-08-20')
      await expect(date).toHaveValue('2026-08-20')
    })

    await step('and nothing is committed while the other half is empty', async () => {
      // Half a stamp is not a stamp. Committing one would record an entry at
      // midnight that nobody said happened at midnight.
      await expect(canvas.getByText('stored: (nothing)')).toBeVisible()
    })
  },
}

/**
 * 193px, the two-column overview pane's width. The pair wraps rather than
 * crushing.
 */
export const Narrow: Story = {
  render: () => <Live start="2026-08-20T14:32:00Z" width={193} />,
  play: async ({ canvas, step }) => {
    const date = canvas.getByLabelText('Occurred date').getBoundingClientRect()
    const time = canvas.getByLabelText('Occurred time').getBoundingClientRect()

    await step('The halves sit on separate rows', async () => {
      await expect(time.top).toBeGreaterThan(date.bottom - 1)
    })

    await step('And the time half is not crushed', async () => {
      // 22px holding a 59px string is the failure this story exists for.
      await expect(time.width).toBeGreaterThan(60)
    })
  },
}

/** Disabled: both boxes and the calendar trigger. */
export const Disabled: Story = {
  render: () => <Live start="2026-08-20T14:32:00Z" disabled />,
}
