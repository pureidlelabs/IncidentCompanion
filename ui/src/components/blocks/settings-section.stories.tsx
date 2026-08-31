import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'

import {
  AbsentRow,
  SettingsRow,
  SettingsSection,
} from '@/components/blocks/settings-section'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { TextField } from '@/components/ui/text-field'

/**
 * `SettingsSection` on the React Aria kit: a titled card of labelled rows, the
 * row bound to its own control, the row for a setting nothing has decided, and
 * the width at which a row stops being a line.
 */
const meta = {
  title: 'Blocks/Form/Settings section',
  component: SettingsSection,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SettingsSection>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The ordinary shape: a titled card, a summary, and one row per setting.
 *
 * A row is a name, a line saying what it does, and the control on the right.
 * The description is beside the name rather than under the control, so the
 * whole of what a setting means is read before the thing that changes it.
 */
export const Rows: Story = {
  name: 'A section of rows',
  args: {
    title: 'Sessions',
    summary: 'How long an analyst stays signed in.',
    children: (
      <>
        <SettingsRow label="Stay signed in" description="Until the browser is closed.">
          <Switch defaultSelected />
        </SettingsRow>
        <SettingsRow label="Sign out everywhere" description="Ends every other session.">
          <Button variant="outline" size="sm" className="w-fit">
            Sign out
          </Button>
        </SettingsRow>
      </>
    ),
  },
  play: async ({ canvas }) => {
    // The description is beside the name rather than under the control, so
    // the whole of what a setting means is read before the thing that
    // changes it.
    const name = canvas.getByText('Stay signed in').getBoundingClientRect()
    const said = canvas.getByText('Until the browser is closed.').getBoundingClientRect()
    const control = canvas.getAllByRole('switch')[0]!.getBoundingClientRect()
    await expect(said.left).toBeLessThan(control.left)
    await expect(said.top).toBeGreaterThanOrEqual(name.top)
  },
}

/** A row with no summary, and no description on either line. */
export const Bare: Story = {
  name: 'A section with no summary',
  args: {
    title: 'Appearance',
    children: (
      <>
        <SettingsRow label="Dense tables">
          <Switch />
        </SettingsRow>
        <SettingsRow label="Show the kill chain rail">
          <Switch defaultSelected />
        </SettingsRow>
      </>
    ),
  },
  play: async ({ canvas }) => {
    // No summary and no descriptions: a section that drew an empty line for
    // each would put three blank rows where two settings are.
    await expect(canvas.getByText('Appearance')).toBeVisible()
    await expect(canvas.getAllByRole('switch')).toHaveLength(2)
    await expect(canvas.getByText('Dense tables')).toBeVisible()
  },
}

/** `htmlFor` binds the row's name to the control, so pressing it focuses the box. */
export const BoundToAControl: Story = {
  name: 'A row bound to its control',
  args: {
    title: 'Identity',
    summary: 'How this analyst is named on a write.',
    children: (
      <SettingsRow
        label="Display name"
        description="Shown beside every row you write."
        htmlFor="settings-display-name"
      >
        <TextField
          id="settings-display-name"
          aria-label="Display name"
          defaultValue="R. Okonkwo"
        />
      </SettingsRow>
    ),
  },
  play: async ({ canvas }) => {
    // Pressing the name focuses the box, which is the whole of what binding
    // them buys: the name is a much larger target than the field.
    await userEvent.click(canvas.getByText('Display name'))
    await expect(canvas.getByLabelText('Display name')).toHaveFocus()
  },
}

/** An unset value is a state the screen owes, and a tag is how it reads. */
export const WithAnAbsentValue: Story = {
  name: 'A setting nothing has decided',
  args: {
    title: 'Single sign-on',
    summary: 'Where accounts come from.',
    children: (
      <>
        <SettingsRow label="Provider" description="The directory this install trusts.">
          <Button variant="outline" size="sm" className="w-fit">
            Choose
          </Button>
        </SettingsRow>
        <AbsentRow label="Tenant" description="Set once a provider is chosen." />
      </>
    ),
  },
  play: async ({ canvas }) => {
    // An unset value is a state the screen owes rather than an empty space:
    // a blank right-hand column reads as a control that failed to draw.
    await expect(canvas.getByText('Not configured')).toBeVisible()
    await expect(canvas.getByText('Set once a provider is chosen.')).toBeVisible()
  },
}

/** The server refused the value: the message belongs to the control, not the row. */
export const Refused: Story = {
  name: 'A refused value',
  args: {
    title: 'Identity',
    summary: 'How this analyst is named on a write.',
    children: (
      <SettingsRow
        label="Display name"
        description="Shown beside every row you write."
        htmlFor="settings-refused-name"
      >
        <TextField
          id="settings-refused-name"
          aria-label="Display name"
          defaultValue="R"
          isInvalid
          errorMessage="A display name is at least two characters."
        />
      </SettingsRow>
    ),
  },
  play: async ({ canvas }) => {
    // The message belongs to the control: a refusal drawn in the row would
    // be read out with the setting's name rather than with the box that was
    // refused, and would not travel with the field to another layout.
    const field = canvas.getByLabelText('Display name')
    await expect(field).toBeInvalid()
    await expect(field).toHaveAccessibleDescription(/at least two characters/)
  },
}

/** A control the install cannot change: greyed, with the row's name still read. */
export const Disabled: Story = {
  name: 'A setting this install cannot change',
  args: {
    title: 'Retention',
    summary: 'Set by the operator, not by an analyst.',
    children: (
      <>
        <SettingsRow label="Keep closed cases" description="Fixed at ninety days.">
          <Switch defaultSelected isDisabled />
        </SettingsRow>
        <SettingsRow
          label="Retention window"
          description="Changed in the compose file."
          htmlFor="settings-retention"
        >
          <TextField
            id="settings-retention"
            aria-label="Retention window"
            defaultValue="90 days"
            isDisabled
          />
        </SettingsRow>
      </>
    ),
  },
  play: async ({ canvas }) => {
    // Refused, not removed. An operator-set value the analyst cannot see is
    // worse than one they can see and cannot change.
    await expect(canvas.getByLabelText('Retention window')).toBeDisabled()
    await expect(canvas.getByLabelText('Retention window')).toHaveValue('90 days')
    await expect(canvas.getByText('Retention window')).toBeVisible()
  },
}

/** The label column caps at `max-w-sm`, so a long line wraps rather than pushing the control off. */
export const ALongDescription: Story = {
  name: 'A name and a description past the column',
  args: {
    title: 'Presence',
    summary: 'What other analysts see while you have the case open.',
    children: (
      <SettingsRow
        label="Announce which section you are reading"
        description={
          'Every analyst with this case open sees the section you are on and the row you '
          + 'are editing, which is what stops two people writing the same field at once.'
        }
      >
        <Switch defaultSelected />
      </SettingsRow>
    ),
  },
  play: async ({ canvas }) => {
    // The column is capped at `max-w-sm`, so a long line wraps inside it
    // rather than taking its share of a wide card and pushing the control to
    // the far edge. Uncapped, the column grows with the pane and the eye has
    // to travel the whole width to reach the thing that changes the setting.
    const said = canvas.getByText(/Every analyst with this case open/)
    const column = said.parentElement!.getBoundingClientRect()
    await expect(column.width).toBeLessThanOrEqual(384)
    await expect(said.getBoundingClientRect().height).toBeGreaterThan(24)

    const control = canvas.getByRole('switch').getBoundingClientRect()
    await expect(said.getBoundingClientRect().right).toBeLessThanOrEqual(control.left)
  },
}

/**
 * Below the `@md` container width the row stacks: the name over the control,
 * rather than beside it. The panel is a container, so the width that decides
 * this is the card's and not the viewport's.
 */
export const Narrow: Story = {
  name: 'Narrow \u2014 the rows stack',
  args: {
    title: 'Appearance',
    summary: 'How the workspace draws itself.',
    children: (
      <>
        <SettingsRow label="Dense tables" description="More rows, less padding.">
          <Switch />
        </SettingsRow>
        <SettingsRow
          label="Display name"
          description="Shown beside every row you write."
          htmlFor="settings-narrow-name"
        >
          <TextField
            id="settings-narrow-name"
            aria-label="Display name"
            defaultValue="R. Okonkwo"
          />
        </SettingsRow>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    // Stacked: the name over the control rather than beside it. The panel is
    // a container, so it is the card's width that decides this and not the
    // window's -- a viewport-width rule would leave the rows side by side in
    // a narrow pane on a wide screen.
    const name = canvas.getByText('Dense tables').getBoundingClientRect()
    const control = canvas.getByRole('switch').getBoundingClientRect()
    await expect(control.top).toBeGreaterThanOrEqual(name.bottom)
  },
}
