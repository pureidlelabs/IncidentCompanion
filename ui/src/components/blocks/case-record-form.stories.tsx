import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { CaseRecordForm, type CaseWrites } from './case-record-form'

/**
 * One pane of the case's own record.
 */
const meta = {
  title: 'Blocks/Form/Case record',
  component: CaseRecordForm,
  parameters: { layout: 'padded' },
  args: { pane: 'details', kase: campaignCase, specs: specsFixture },
} satisfies Meta<typeof CaseRecordForm>

export default meta
type Story = StoryObj<typeof meta>

/** A case created and not yet filled in: every field served, none answered. */
const BLANK: Case = {
  ...campaignCase,
  title: 'Untitled case',
  customer: '',
  reference: '',
  analyst: '',
  summary: '',
  detectionSource: '',
  initialAccessVector: '',
  detectionGap: '',
  detectedAt: null,
  containedAt: null,
  eradicatedAt: null,
  recoveredAt: null,
}

/** What the case is and who it is for. */
export const Details: Story = { name: 'The case details pane' }

/**
 * The five stamps the investigation is measured against.
 */
export const KeyTimes: Story = {
  name: 'The key times pane',
  args: { pane: 'times' },
}

/** A case nobody has filled in yet. The groups keep their shape. */
export const Empty: Story = {
  name: 'A case nobody has filled in',
  args: { kase: BLANK },
}

/**
 * A field another analyst wrote first.
 */
export const Refused: Story = {
  name: 'A write another analyst refused',
  args: { refusal: { field: 'Severity', by: 'j.mensah' } },
}

/**
 * Two fields the server refused on their own values.
 */
export const FieldsRefused: Story = {
  name: 'Fields the server refused',
  args: {
    refused: {
      reference: 'A reference is at most 64 characters.',
      recoveredAt: 'Recovery cannot be before containment.',
    },
  },
}

/**
 * A 414px viewport.
 */
export const Narrow: Story = {
  name: 'A narrow viewport',
  globals: { viewport: { value: 'mobile2' } },
}

/** A title and a summary past the measure the form holds them to. */
export const Overlong: Story = {
  name: 'A value too long for its field',
  args: {
    kase: {
      ...campaignCase,
      title:
        'Human-operated ransomware across the Meridian Logistics finance, HR and directory estate, with exfiltration',
      customer: 'Meridian Logistics Group International Holdings B.V.',
      initialAccessVector:
        'Macro-enabled attachment on a spoofed supplier invoice, opened by a finance user with local administrator rights',
    },
  },
}

/**
 * A version no case in the fixtures carries.
 */
const AT_VERSION = 7

/** The demo case, read at a version the stories can recognise on the wire. */
const READ_AT: Case = { ...campaignCase, version: AT_VERSION }

/** The write seam, spied on. One per story, since `fn` remembers its calls. */
function spying(): CaseWrites {
  return { save: fn(() => Promise.resolve({})) }
}

/**
 * A field typed into and left, all the way through to the seam.
 */
export const SendsAFieldEdit: Story = {
  name: 'Sending a field the analyst changed',
  args: { kase: READ_AT, writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const reference = canvas.getByLabelText('Incident reference')
    await userEvent.clear(reference)
    await userEvent.type(reference, 'INC-2026-0042')
    // The write is on blur, so the field has to be left rather than submitted.
    await userEvent.tab()

    await expect(args.writes!.save).toHaveBeenCalledWith(
      'reference',
      'INC-2026-0042',
      AT_VERSION,
    )
  },
}

/**
 * A field visited and left untouched, which sends nothing.
 */
export const SendsNothingUnmoved: Story = {
  name: 'A field visited and not changed',
  args: { kase: READ_AT, writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Incident reference'))
    await userEvent.tab()

    await expect(args.writes!.save).not.toHaveBeenCalled()
  },
}
