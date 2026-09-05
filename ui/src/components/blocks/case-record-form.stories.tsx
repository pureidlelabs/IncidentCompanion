import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import type { Case } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { CaseRecordForm, type CaseWrites } from './case-record-form'

/**
 * One pane of the case's own record.
 *
 * Read it against the served form rather than against the demo: a field the
 * server adds and neither group names still renders, on the details pane.
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
 *
 * Three of them cannot be answered until the incident is over, so this is the
 * pane that stays empty longest.
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
 *
 * A refused write is an answer rather than an error: it names who set the
 * field and sends you back to read what it holds now.
 */
export const Refused: Story = {
  name: 'A write another analyst refused',
  args: { refusal: { field: 'Severity', by: 'j.mensah' } },
}

/**
 * Two fields the server refused on their own values.
 *
 * The refusals hang on the controls rather than floating above the form, so a
 * screen reader announces each one on the field it belongs to.
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
 *
 * **The viewport rather than a fixed-width wrapper**, and the difference is
 * load-bearing: `FormSection`'s grid falls to one column at Tailwind's `sm`,
 * which is a *viewport* breakpoint - so a 420px `div` on a wide screen keeps
 * two columns and crushes the date field into 22px of input.
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
 *
 * `campaign.json` is at version 1, which is also what a seam that lost the
 * version and fell back to a default would send. The distinct number is what
 * lets the stories below tell those two apart.
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
 *
 * Both the overview and the case settings pane are this block, and until this
 * story neither showed what leaves. A value held in the draft and never sent
 * looks identical on screen to one the server took.
 *
 * **The version is the claim.** It is the version the form was *drawn* at
 * rather than one re-read at the moment of writing: re-reading adopts the
 * other analyst's value as your base, and the check then passes on a save that
 * should have been a merge review.
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
 *
 * Blur is the trigger, so every field an analyst tabs through on the way to
 * the one they meant would otherwise be a write -- and each of those is a
 * version bump another analyst's open screen has to be told about, for a value
 * nobody changed.
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
