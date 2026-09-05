import type { Meta, StoryObj } from '@storybook/react-vite'

import { expect } from 'storybook/test'

import { Button } from './button'
import { Input } from './input'
import { Problem } from './problem'

/**
 * The row a refusal is drawn in, at field scope and at form scope.
 *
 * **Its two states are "no message" and "message", and the first is the one
 * worth looking at.** The row keeps its height either way, so the control
 * below it does not jump when the refusal arrives -- and that is invisible in
 * a screenshot of one state. `BeforeAndAfter` puts the two forms side by side
 * at the same width so the shift is the only difference between them.
 */
const meta = {
  title: 'Components/Problem',
  component: Problem,
  parameters: { layout: 'padded' },
  args: { children: null },
} satisfies Meta<typeof Problem>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Filled, and only then a live region a screen reader reads out.
 *
 * An empty live region present from mount announces nothing at the moment it
 * appears and competes with the field's own label the rest of the time. The role
 * arrives with the text, so the announcement is the refusal.
 */
export const Filled: Story = {
  args: { children: 'Enter an email address.' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Enter an email address.')
  },
}

/**
 * Empty: no `role`, and the height still reserved.
 *
 * The dashed box is there to make the reserved row visible, since an empty row
 * is exactly what a screenshot cannot show.
 */
export const Empty: Story = {
  render: (args) => (
    <div className="w-72 border border-dashed border-border">
      <Problem {...args} />
    </div>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const row = canvasElement.querySelector<HTMLElement>('[data-slot="problem"]')!

    await step('Nothing is announced', async () => {
      await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
    })

    await step('And the row still takes its height', async () => {
      await expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(16)
    })
  },
}

/**
 * Under the field it describes, which is what `aria-describedby` points at.
 *
 * **The `id` is the caller's**, because only the field knows what its control
 * has to point at. So the wiring is three things: `aria-invalid` on the control,
 * an `id` on the row, and that `id` in the control's `aria-describedby`.
 */
export const UnderAField: Story = {
  args: { children: 'That host is already on the case.' },
  render: (args) => (
    <div className="flex w-72 flex-col gap-1">
      <label className="text-sm" htmlFor="host">
        Host
      </label>
      <Input id="host" defaultValue="FIN-WS-04" aria-invalid aria-describedby="host-problem" />
      <Problem id="host-problem">{args.children}</Problem>
    </div>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const field = canvas.getByLabelText('Host')

    await step('The control says it is refused', async () => {
      await expect(field).toHaveAttribute('aria-invalid', 'true')
    })

    await step('And points at the row that says why', async () => {
      const named = (field.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => canvasElement.ownerDocument.getElementById(id))
      await expect(named.map((el) => el?.textContent).join(' ')).toContain(
        'That host is already on the case.',
      )
    })
  },
}

/**
 * The two forms at the same width: the refusal costs no height, so the button
 * is in the same place in both.
 *
 * **This is the whole component.** A row that grows when the message arrives
 * moves the button somebody is already reaching for, so the press aimed at Add
 * lands on whatever the refusal pushed into its place. The `play` measures the
 * two buttons against each other, which is the only form the claim can take --
 * neither screen alone shows it.
 */
export const BeforeAndAfter: Story = {
  render: () => (
    <div className="flex gap-8">
      {[null, 'That host is already on the case.'].map((message, index) => (
        <div key={index} className="flex w-64 flex-col gap-1 rounded-lg border p-3">
          <label className="text-sm">Host</label>
          <Input defaultValue="FIN-WS-04" {...(message ? { 'aria-invalid': true } : {})} />
          <Problem>{message}</Problem>
          <Button size="sm" className="self-end">
            Add
          </Button>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas, step }) => {
    const [before, after] = canvas.getAllByRole('button', { name: 'Add' })

    await step('One of the two is refused and the other is not', async () => {
      await expect(canvas.getAllByRole('alert')).toHaveLength(1)
    })

    await step('And the button has not moved', async () => {
      await expect(before!.getBoundingClientRect().top).toBeCloseTo(
        after!.getBoundingClientRect().top,
        0,
      )
    })
  },
}

/**
 * Form scope: one refusal for the whole dialog rather than for one field.
 *
 * No field is marked here, because none of them is wrong -- the write was
 * refused after the fact. Marking a field would send the analyst looking for a
 * mistake that is not in the form.
 */
export const AtFormScope: Story = {
  args: { children: 'Nothing was saved. Another analyst wrote to this system first.' },
  render: (args) => (
    <form className="flex w-80 flex-col gap-2 rounded-lg border p-4">
      <label className="text-sm">Host</label>
      <Input defaultValue="FIN-WS-04" />
      <label className="text-sm">Owner</label>
      <Input defaultValue="nadia.okonjo" />
      <Problem>{args.children}</Problem>
      <Button size="sm" className="self-end">
        Save
      </Button>
    </form>
  ),
  play: async ({ canvas, step }) => {
    await step('One refusal, for the form', async () => {
      await expect(canvas.getByRole('alert')).toHaveTextContent('Nothing was saved.')
    })

    await step('And no field is marked wrong', async () => {
      for (const box of canvas.getAllByRole('textbox')) {
        await expect(box).not.toHaveAttribute('aria-invalid', 'true')
      }
    })
  },
}
