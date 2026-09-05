import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, fn } from 'storybook/test'

import { Button } from './button'
import { Form } from './form'
import { TextArea } from './textarea'

/**
 * `onSubmitted` is not a prop of `TextArea`. `EnterStartsALine` needs a spy to
 * assert the form did not submit, and an intersection is how a story declares
 * an arg the component does not have.
 */
type StoryArgs = ComponentProps<typeof TextArea> & { onSubmitted: () => void }

/**
 * Several lines of text, with a label, a description and a refusal message.
 *
 * **Enter inserts a newline rather than submitting.** That is what separates it
 * from a `TextField`: an analyst writing a note presses Enter to start a line,
 * and a form submitting on it would lose the rest.
 *
 * `rows` sets the height the box opens at; the corner drags past it unless
 * `resize="none"` pins it, which is for a box inside a layout that cannot grow.
 *
 * **The one multi-line box in the kit**, in a form or out of one. Pass no
 * `label` for a box that a `Field` or a heading already names, and the native
 * `disabled` and `aria-invalid` a `Field` hands its controls are bridged to
 * React Aria's own.
 */
const meta = {
  title: 'Components/TextArea',
  component: TextArea,
  parameters: { layout: 'centered' },
  args: {
    label: 'Analyst note',
    placeholder: 'What the timeline does not say',
    onSubmitted: fn(),
  },
  render: ({ onSubmitted: _onSubmitted, ...args }) => <TextArea {...args} />,
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

/** Three visible lines by default, with the label wired to the box. */
export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Analyst note')).toHaveAttribute(
      'placeholder',
      'What the timeline does not say',
    )
  },
}

/** One line under the box, announced with the field. */
export const WithDescription: Story = {
  args: { description: 'Visible to every analyst on the case.' },
  play: async ({ canvas, canvasElement }) => {
    const describedBy = canvas.getByLabelText('Analyst note').getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Visible to every analyst on the case.')
  },
}

/**
 * **Enter starts a line; it does not submit.**
 *
 * The `play` types two lines inside a form and asserts the handler never ran and
 * the value carries the newline. A box that submitted on Enter would lose
 * whatever the analyst had not finished writing, and would do it silently.
 */
export const EnterStartsALine: Story = {
  render: ({ onSubmitted }) => (
    <Form
      className="flex w-80 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmitted()
      }}
    >
      <TextArea label="Analyst note" />
      <Button type="submit" size="sm">
        Save
      </Button>
    </Form>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByLabelText('Analyst note')
    await userEvent.type(box, 'First line{Enter}second line')

    await expect(box).toHaveValue('First line\nsecond line')
    await expect(args.onSubmitted).not.toHaveBeenCalled()
  },
}

/** `rows` sets the visible height; the corner drags past it. */
export const Rows: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex flex-col gap-4">
      <TextArea {...args} label="Two lines" rows={2} defaultValue="Short" />
      <TextArea {...args} label="Six lines" rows={6} defaultValue="Long" />
    </div>
  ),
  play: async ({ canvas }) => {
    const two = canvas.getByLabelText('Two lines').getBoundingClientRect().height
    const six = canvas.getByLabelText('Six lines').getBoundingClientRect().height
    await expect(six).toBeGreaterThan(two)
  },
}

/**
 * `resize="none"` pins the height, for a box inside a layout that cannot grow.
 *
 * A resizable box in a fixed pane is dragged past the pane's edge and the grip
 * ends up under something else, so this is a real choice rather than a default
 * worth keeping everywhere.
 */
export const NoResize: Story = {
  args: { resize: 'none', defaultValue: 'Fixed height' },
  play: async ({ canvas }) => {
    await expect(getComputedStyle(canvas.getByLabelText('Analyst note')).resize).toBe('none')
  },
}

/** `isDisabled` greys the box and takes it out of the tab order. */
export const Disabled: Story = {
  args: { defaultValue: 'Read-only while the case is closed', isDisabled: true },
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Button size="sm" variant="outline">
        Before
      </Button>
      <TextArea {...args} />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    canvas.getByRole('button', { name: 'Before' }).focus()
    await userEvent.tab()
    await expect(canvas.getByLabelText('Analyst note')).not.toHaveFocus()
  },
}

/** `isInvalid` plus `errorMessage`, bound to the box. */
export const Invalid: Story = {
  args: {
    defaultValue: '',
    isInvalid: true,
    errorMessage: 'A note is required before the case closes.',
  },
  play: async ({ canvas, canvasElement }) => {
    const box = canvas.getByLabelText('Analyst note')
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    const describedBy = box.getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('A note is required before the case closes.')
  },
}

/**
 * The longest note an analyst would actually write, and an empty one.
 *
 * The box scrolls rather than growing past `rows`, so a long note keeps the
 * form's layout and the analyst scrolls inside the box they are writing in.
 */
export const Extremes: Story = {
  render: ({ label: _label, ...args }) => (
    <div className="flex w-80 flex-col gap-4">
      <TextArea {...args} label="Empty" defaultValue="" />
      <TextArea
        {...args}
        label="Long"
        defaultValue={Array.from(
          { length: 12 },
          (_, index) =>
            `Line ${String(index + 1)}: the mailbox was read in bulk over the Graph API, and an inbox rule forwarded the invoice thread onwards.`,
        ).join('\n')}
      />
    </div>
  ),
}

/**
 * No label of its own, which is the shape a `Field` wraps.
 *
 * The `Field` draws the label, the description and the error, so the box takes
 * an `aria-label` and nothing else -- and still draws its own border, because
 * nothing is drawing one around it.
 */
export const Unlabelled: Story = {
  args: {
    // The meta gives every other story a label; this is the one that must not
    // have one.
    label: undefined,
    'aria-label': 'Notes',
    placeholder: 'What was seen, and where',
    defaultValue:
      'The mailbox was read in bulk over the Graph API, and an inbox rule '
      + 'forwarded anything matching the invoice thread to an external address.',
  },
  play: async ({ canvas, step }) => {
    const box = canvas.getByLabelText('Notes')

    await step('It is named without a label element', async () => {
      await expect(box).toBeInTheDocument()
      await expect(canvasHasLabelElement(box)).toBe(false)
    })

    await step('And draws its own border', async () => {
      await expect(
        Number.parseFloat(getComputedStyle(box).borderTopWidth),
      ).toBeGreaterThan(0)
    })
  },
}

/** Whether a label element names this box, rather than an `aria-label`. */
function canvasHasLabelElement(box: HTMLElement): boolean {
  return box.closest('[data-slot="textarea-field"]')?.querySelector('label') !== null
}

/**
 * The two refusals a `Field` hands down, in the native spellings it uses.
 *
 * `disabled` and `aria-invalid` rather than `isDisabled` and `isInvalid`: the
 * bundle a `Field` gives every control is shaped for the platform, and this box
 * bridges it so a caller spreads the bundle without knowing which kind of
 * control it is spreading into.
 */
export const FromAFieldBundle: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      <TextArea aria-label="Refused notes" defaultValue="Too short" aria-invalid />
      <TextArea aria-label="Disabled notes" defaultValue="Closed for editing" disabled />
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step('The native spellings reach React Aria', async () => {
      await expect(canvas.getByLabelText('Disabled notes')).toBeDisabled()
      await expect(canvas.getByLabelText('Refused notes')).toHaveAttribute(
        'aria-invalid',
        'true',
      )
    })
  },
}
