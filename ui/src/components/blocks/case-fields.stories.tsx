import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { formSpec, isSection, type FieldSpec } from '@/api/specs'
import { specsFixture } from '@/fixtures/specs'

import { CaseFields } from './case-fields'

/**
 * The fields a case is minted from, drawn from the served schema rather than
 * listed by hand.
 */
const meta = {
  title: 'Blocks/Form/Case fields',
  component: CaseFields,
  parameters: { layout: 'padded' },
  args: {
    form: formSpec(specsFixture, 'CASE_FIELDS'),
    names: ['title', 'customer', 'reference', 'summary'],
    values: {},
    onChange: () => undefined,
  },
} satisfies Meta<typeof CaseFields>

export default meta
type Story = StoryObj<typeof meta>

/** The picker's subset, empty, as the door opens. */
export const Empty: Story = {
  name: 'Nothing typed yet',
  play: async ({ args, canvas }) => {
    // One control per name the door asked for, and each labelled from the
    // served spec rather than from a string in this file. A block that
    // listed its own fields could name one the write is not checked against.
    // `fields` carries section markers as well as fields, so the entry for a
    // name is found through the guard rather than by reading `name` off
    // whatever happens to be at that position.
    for (const name of args.names) {
      const field = args.form.fields.find((one) => !isSection(one) && one.name === name)
      await expect(field).toBeDefined()
      await expect(canvas.getByLabelText(new RegExp((field as FieldSpec).label))).toBeVisible()
    }
  },
}

/** The same fields with a case already described. */
export const Filled: Story = {
  name: 'A case described',
  args: {
    values: {
      title: 'Ransomware on the file estate',
      customer: 'Northwind Freight',
      reference: 'INC-2026-0447',
      summary: 'Encryption on three file servers, staged over the weekend.',
    },
  },
  play: async ({ canvas }) => {
    // The values are drawn into the controls the spec produced, which is what
    // says the two halves are joined by name rather than by position.
    await expect(canvas.getByDisplayValue('Ransomware on the file estate')).toBeVisible()
    await expect(canvas.getByDisplayValue('INC-2026-0447')).toBeVisible()
  },
}

/**
 * What the form refuses, spoken per field.
 */
export const Refused: Story = {
  name: 'The server refusing a field',
  args: {
    values: { title: '', customer: 'Northwind Freight' },
    required: ['title'],
    problems: { title: 'A case needs a title.' },
  },
  play: async ({ canvas }) => {
    // Spoken per field and in the server's own words: which fields are
    // required is install policy the client does not hold, so a message
    // written here would be this block's guess at somebody else's rule.
    await expect(canvas.getByText('A case needs a title.')).toBeVisible()

    // And attached to the field it is about, so it is read out with the box
    // rather than floating at the top of the form.
    await expect(canvas.getByLabelText(/Title/)).toHaveAccessibleDescription(
      /A case needs a title\./,
    )
  },
}

/**
 * A hint a door adds that the served form does not carry.
 */
export const Hinted: Story = {
  name: 'A door adding its own hint',
  args: {
    names: ['title', 'customer'],
    hints: { customer: 'The one thing the incident cannot answer.' },
  },
  play: async ({ canvas }) => {
    // A door's own hint about a field the spec already describes generally.
    await expect(canvas.getByText('The one thing the incident cannot answer.')).toBeVisible()

    // And only the two names asked for: a block that drew the whole spec
    // would put a door's unrelated fields in front of the analyst.
    await expect(canvas.queryByLabelText(/Reference/)).toBeNull()
  },
}
