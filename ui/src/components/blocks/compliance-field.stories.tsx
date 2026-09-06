import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, within } from 'storybook/test'

import type { ComplianceRecord } from '@/api/compliance'
import type { ComplianceFieldSpec } from '@/api/specs'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

import { ComplianceControl } from './compliance-field'

/**
 * The three shapes a served set of options is drawn in.
 *
 * Which one a field gets is read off the options themselves - their length and
 * whether they share a stem - so these stories are the vocabularies that
 * produce each, not a switch a field asks for.
 */
/** One served compliance field, by the name the parsed document gives it. */
function served(name: string): ComplianceFieldSpec {
  const field = specsFixture.compliance.forms.ALL_FIELDS?.fields.find((one) => one.name === name)
  if (field === undefined) throw new Error(`no served field named ${name}`)
  return field
}

export interface LiveProps {
  /** The served field descriptor, whose options decide the shape. */
  spec: ComplianceFieldSpec
  seed?: readonly string[]
}

/** The control holding its own answer, the way the screen holds it. */
function Live({ spec, seed }: LiveProps) {
  const [record, setRecord] = useState<ComplianceRecord>({
    ...campaignCompliance,
    ...(seed === undefined ? {} : { [spec.name]: [...seed] }),
  })
  return (
    <ComplianceControl
      spec={spec}
      record={record}
      onSet={(name, value) => {
        setRecord((was) => ({ ...was, [name]: value }))
      }}
    />
  )
}

/** The compliance control an analyst answers a served question through, live at each vocabulary shape a field can take. */
const meta = {
  title: 'Blocks/Form/Compliance field control',
  component: Live,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Live>

export default meta
type Story = StoryObj<typeof meta>

/**
 * 27 Member State codes, which as a column is 1,400px to choose four things
 * from.
 */
export const ShortCodes: Story = {
  name: 'A set of short codes',
  args: { spec: served('affectedMemberStates') },
  // The claim is the shape, and a screenshot cannot say how many rows there
  // are: a column of 27 checkboxes renders perfectly well.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryAllByRole('checkbox')).toHaveLength(0)
    await expect(canvas.getAllByRole('row')).toHaveLength(27)
  },
}

/** The same set with four codes chosen, which is what an analyst leaves behind. */
export const ShortCodesChosen: Story = {
  name: 'Short codes, four chosen',
  args: { spec: served('affectedMemberStates'), seed: ['BE', 'DE', 'FR', 'NL'] },
}

/**
 * DORA's detailed root causes: 28 options over five parents, and the parent is
 * said once rather than on all 28 rows.
 */
export const Grouped: Story = {
  name: 'A vocabulary with parents',
  args: { spec: served('doraRootCauseDetailed') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(28)
    // Said once. Eleven options carry it.
    await expect(canvas.getAllByText('process failure')).toHaveLength(1)
  },
}

/** The grouped set with three causes recorded, one from three different parents. */
export const GroupedChosen: Story = {
  name: 'A vocabulary with parents, three chosen',
  args: {
    spec: served('doraRootCauseDetailed'),
    seed: [
      'malicious actions: fraudulent actions',
      'human error: omission',
      'external event: third-party failures',
    ],
  },
}

/** Four options and no shared stem: the plain column, which is right for four. */
export const PlainColumn: Story = {
  name: 'A short list keeps its column',
  args: { spec: served('gdprCircumstances'), seed: ['confidentiality'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(4)
  },
}

/** Ten options, every one a sentence: also the column, and for the same reason. */
export const LongOptions: Story = {
  name: 'Ten long options keep their column',
  args: { spec: served('doraThreatTechniques') },
}
