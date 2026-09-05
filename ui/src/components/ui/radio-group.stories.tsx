import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, Mail, ShieldAlert, Siren, Users } from 'lucide-react'
import { expect, within } from 'storybook/test'

import { Radio, RadioGroup } from './radio-group'

/**
 * A set of options, one of which is chosen.
 *
 * **The group is one tab stop and the arrow keys move the selection**, which is
 * what separates it from a column of checkboxes. An analyst tabbing through a
 * form passes the whole set rather than every option in it, and moving inside
 * it selects as it goes.
 *
 * The group owns the label, the description and the refusal; an option may
 * carry a description of its own. Where an option needs a reason it cannot be
 * chosen, the group is the wrong control -- a radio that refuses says nothing
 * about why.
 *
 * `variant` decides how much room an option takes: `plain` for a short list,
 * `bordered` where the whole row should be pressable, `card` where each option
 * needs a sentence explaining it.
 */
const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A column of options, one selected.
 *
 * The `play` walks the group the way an analyst does: one tab to reach it, then
 * arrows. A group that had grown a tab stop per option would still look right
 * and would put three stops in a form where the author counted one.
 */
export const Default: Story = {
  args: {
    label: 'Severity',
    defaultValue: 'medium',
    children: (
      <>
        <Radio value="high">High</Radio>
        <Radio value="medium">Medium</Radio>
        <Radio value="low">Low</Radio>
      </>
    ),
  },
  play: async ({ canvas, step, userEvent }) => {
    await step('One tab reaches the selected option, not the first', async () => {
      await userEvent.tab()
      await expect(canvas.getByRole('radio', { name: 'Medium' })).toHaveFocus()
    })

    await step('An arrow moves the selection along with the focus', async () => {
      await userEvent.keyboard('{ArrowDown}')
      const low = canvas.getByRole('radio', { name: 'Low' })
      await expect(low).toHaveFocus()
      await expect(low).toBeChecked()
      await expect(canvas.getByRole('radio', { name: 'Medium' })).not.toBeChecked()
    })

    await step('And one more tab leaves the group entirely', async () => {
      await userEvent.tab()
      for (const option of canvas.getAllByRole('radio')) {
        await expect(option).not.toHaveFocus()
      }
    })
  },
}

/** Laid out in a row. */
export const Horizontal: Story = {
  args: {
    label: 'Ground',
    orientation: 'horizontal',
    defaultValue: 'light',
    children: (
      <>
        <Radio value="light">Light</Radio>
        <Radio value="dark">Dark</Radio>
        <Radio value="system">System</Radio>
      </>
    ),
  },
}

/** Each option with a description line. */
export const WithDescriptions: Story = {
  args: {
    label: 'Who may open this case',
    defaultValue: 'team',
    children: (
      <>
        <Radio value="team" description="Everyone on the shift rota.">
          The team
        </Radio>
        <Radio value="me" description="Nobody else sees it in the picker.">
          Only me
        </Radio>
      </>
    ),
  },
}

/**
 * A disabled group, and one disabled option in a live group.
 *
 * Disabling the group takes the whole set out of the tab order. Disabling one
 * option leaves the group reachable and that option skipped by the arrows, so
 * an analyst cannot land on it at all.
 */
export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <RadioGroup label="Disabled group" defaultValue="medium" isDisabled>
        <Radio value="high">High</Radio>
        <Radio value="medium">Medium</Radio>
      </RadioGroup>
      <RadioGroup label="One option disabled" defaultValue="high">
        <Radio value="high">High</Radio>
        <Radio value="medium" isDisabled>
          Medium
        </Radio>
        <Radio value="low">Low</Radio>
      </RadioGroup>
    </div>
  ),
  play: async ({ canvas, step, userEvent }) => {
    // Both groups hold a "High", so every query is scoped to its own group.
    const dead = within(canvas.getByRole('radiogroup', { name: /Disabled group/ }))
    const live = within(canvas.getByRole('radiogroup', { name: /One option disabled/ }))

    await step('The disabled group is not reachable at all', async () => {
      await userEvent.tab()
      for (const option of dead.getAllByRole('radio')) {
        await expect(option).not.toHaveFocus()
      }
    })

    await step('The arrows skip the one disabled option', async () => {
      live.getByRole('radio', { name: 'High' }).focus()
      await userEvent.keyboard('{ArrowDown}')
      await expect(live.getByRole('radio', { name: 'Low' })).toHaveFocus()
      await expect(live.getByRole('radio', { name: 'Medium' })).not.toBeChecked()
    })
  },
}

/** Invalid, with the error under the set. */
export const Invalid: Story = {
  args: {
    label: 'Severity',
    isInvalid: true,
    errorMessage: 'Choose a severity before saving.',
    children: (
      <>
        <Radio value="high">High</Radio>
        <Radio value="medium">Medium</Radio>
      </>
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    // The refusal sits on the group rather than on whichever option was last
    // touched, so it is announced once and read as being about the choice.
    const group = canvas.getByRole('radiogroup', { name: /Severity/ })
    await expect(group).toHaveAttribute('aria-invalid', 'true')
    const describedBy = group.getAttribute('aria-describedby')
    await expect(
      canvasElement.querySelector('#' + CSS.escape(describedBy ?? '')),
    ).toHaveTextContent('Choose a severity before saving.')
  },
}

/** `bordered` gives every option its own pressable row. The chosen one takes the tone as a wash. */
export const Bordered: Story = {
  args: {
    label: 'Who may open this case',
    variant: 'bordered',
    defaultValue: 'team',
    className: 'w-80',
    children: (
      <>
        <Radio value="team" icon={<Users />}>
          The team
        </Radio>
        <Radio value="shift" icon={<Siren />}>
          The shift on call
        </Radio>
        <Radio value="me" icon={<Mail />}>
          Only me
        </Radio>
      </>
    ),
  },
}

/**
 * A bordered row with a description under the label.
 *
 * **The whole box is pressable**, which is the reason to reach for this variant
 * at all: a 16px dot beside a sentence is a target an analyst misses, and the
 * `play` presses the description rather than the dot.
 */
export const BorderedWithDescriptions: Story = {
  args: {
    label: 'Report layout',
    variant: 'bordered',
    defaultValue: 'rca',
    className: 'w-96',
    children: (
      <>
        <Radio value="rca" icon={<FileText />} description="Full root cause analysis, for the customer.">
          Customer RCA
        </Radio>
        <Radio value="exec" icon={<ShieldAlert />} description="One page, findings and actions only.">
          Executive briefing
        </Radio>
      </>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('One page, findings and actions only.'))
    await expect(canvas.getByRole('radio', { name: /Executive briefing/ })).toBeChecked()
  },
}

/** `card` lays the same box out as a block, with the dot beside the first line. */
export const Cards: Story = {
  args: {
    label: 'How this case was raised',
    variant: 'card',
    defaultValue: 'alert',
    className: 'w-96',
    children: (
      <>
        <Radio
          value="alert"
          icon={<Siren />}
          description="An EDR or SIEM alert crossed the threshold and opened the case automatically."
        >
          Alert
        </Radio>
        <Radio
          value="report"
          icon={<Mail />}
          description="Somebody at the customer reported it, usually a suspicious mail."
        >
          Customer report
        </Radio>
        <Radio
          value="hunt"
          icon={<ShieldAlert />}
          description="Found while hunting, with no alert behind it."
        >
          Threat hunt
        </Radio>
      </>
    ),
  },
}

/** Cards in a row. The group's orientation lays them side by side. */
export const CardsHorizontal: Story = {
  args: {
    label: 'Ground',
    variant: 'card',
    orientation: 'horizontal',
    defaultValue: 'dark',
    children: (
      <>
        <Radio value="light" description="For a bright room.">
          Light
        </Radio>
        <Radio value="dark" description="For a dark room.">
          Dark
        </Radio>
        <Radio value="system" description="Follows the machine.">
          System
        </Radio>
      </>
    ),
  },
}

/** The ladder side by side, and what each does when refused or disabled. */
export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <RadioGroup label="Plain, the default" defaultValue="high">
        <Radio value="high">High</Radio>
        <Radio value="medium">Medium</Radio>
      </RadioGroup>
      <RadioGroup label="Bordered" variant="bordered" defaultValue="high" className="w-80">
        <Radio value="high">High</Radio>
        <Radio value="medium">Medium</Radio>
      </RadioGroup>
      <RadioGroup label="Card" variant="card" defaultValue="high" className="w-80">
        <Radio value="high" description="Contain the host within the hour.">
          High
        </Radio>
        <Radio value="medium" description="Investigate during the shift.">
          Medium
        </Radio>
      </RadioGroup>
      <RadioGroup
        label="Bordered, refused"
        variant="bordered"
        isInvalid
        errorMessage="Choose a severity before saving."
        className="w-80"
      >
        <Radio value="high">High</Radio>
        <Radio value="medium">Medium</Radio>
      </RadioGroup>
      <RadioGroup label="Card, disabled" variant="card" defaultValue="high" isDisabled className="w-80">
        <Radio value="high" description="Contain the host within the hour.">
          High
        </Radio>
        <Radio value="medium">Medium</Radio>
      </RadioGroup>
      <RadioGroup label="One option overriding the group" variant="bordered" defaultValue="high" className="w-80">
        <Radio value="high">Bordered, from the group</Radio>
        <Radio value="medium" variant="plain">
          Plain, set on the option
        </Radio>
      </RadioGroup>
    </div>
  ),
}
