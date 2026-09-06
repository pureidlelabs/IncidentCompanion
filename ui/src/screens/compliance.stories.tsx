import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'

import type { ComplianceRecord, ComplianceVerdict } from '@/api/compliance'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'
import { regimesFixture, withRegimes } from '@/fixtures/regimes'

import { ComplianceScreen, type ComplianceWrites } from './compliance'
import { inACase } from '@/fixtures/in-a-case'

/**
 * The regulatory record.
 *
 * Which cards exist is an install preference, so the screen is drawn with the
 * regimes switched on and again with two of them off.
 */
const meta = {
  title: 'Screens/Report/Compliance',
  component: ComplianceScreen,
  decorators: [inACase('compliance')],
  parameters: { layout: 'fullscreen' },
  args: {
    record: campaignCompliance,
    specs: specsFixture,
    regimes: regimesFixture,
  },
} satisfies Meta<typeof ComplianceScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The record as the server seeds it: a row per case, every regulatory field
 * empty.
 *
 * No demo fills one, so this is the state every install opens on. The chip on
 * each card reads "Not started" rather than a fraction of zero.
 */
export const Empty: Story = {
  name: 'Nothing answered yet',
}

/**
 * Part-filled, which is what the screen looks like for most of a case.
 *
 * The Entity and Incident-facts cards are answered, the two findings cards
 * are not, and the first unfinished card is the one that opens.
 */
export const PartFilled: Story = {
  name: 'Part-filled',
  args: { record: partFilled() },
  // The count is the claim. A test that only mounts cannot tell a progress
  // bar reading the right fraction from one reading every field as answered.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = await canvas.findByText(/of \d+ answered/)
    const [set, total] = /(\d+) of (\d+)/.exec(badge.textContent)?.slice(1) ?? []
    await expect(Number(set)).toBeGreaterThan(0)
    await expect(Number(set)).toBeLessThan(Number(total))
  },
}

/**
 * A ground answered `no`, which is an answer.
 *
 * `false` and "nobody has said" are different facts and a falsy test collapses
 * them, which would take ten NIS2 and DORA grounds off the count at once.
 */
export const AnsweredNo: Story = {
  name: 'A ground answered no',
  args: { record: answeredNo() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = await canvas.findByText(/of \d+ answered/)
    await expect(Number(/(\d+) of/.exec(badge.textContent)?.[1])).toBeGreaterThanOrEqual(3)
  },
}

/**
 * NIS2 and DORA switched off at the install.
 *
 * Findings and DORA go entirely; Entity falls back to the three fields the
 * reduced form names. Nothing asks a question this install has no obligation
 * for.
 */
export const FewerRegimes: Story = {
  name: 'Two regimes switched off',
  args: { regimes: withRegimes(['nis2', 'dora']) },
  play: async ({ canvas, step }) => {
    await step('the regimes this install does not answer for are gone', async () => {
      // Not greyed, not empty -- gone. A card for a regime nobody is bound by
      // is a question the analyst has no obligation to answer, and answering
      // it is worse than not being asked.
      await expect(canvas.queryByText('DORA')).toBeNull()
    })
    await step('and what remains is still asked', async () => {
      await expect(canvas.getByText(/GDPR/)).toBeVisible()
    })
  },
}

/** What the server reads back from those answers. */
const VERDICTS: readonly ComplianceVerdict[] = [
  {
    regime: 'NIS2',
    article: 'Art 23',
    verdict: true,
    rule: 'significant-incident',
    detail: 'An essential entity with a complete outage over 24 hours.',
    readiness: 'The early warning is due 24 hours from the recorded awareness.',
    criteria: [
      {
        met: true,
        label: 'Essential or important entity',
        article: 'Art 3',
        detail: 'Recorded as essential.',
      },
      {
        met: true,
        label: 'Severe operational disruption',
        article: 'Art 23(3)(a)',
        detail: '4310 minutes of complete outage.',
      },
      {
        met: null,
        label: 'Unlawful or malicious act suspected',
        article: 'IR Art 3(1)(e)',
        detail: 'Not stated.',
      },
    ],
  },
  {
    regime: 'GDPR',
    article: 'Art 33',
    verdict: null,
    rule: 'risk-to-rights',
    detail: 'Personal data is involved and the risk band has not been recorded.',
    readiness: '',
    criteria: [
      {
        met: true,
        label: 'Personal data involved',
        article: 'Art 4(12)',
        detail: 'Recorded as involved.',
      },
      {
        met: null,
        label: 'Risk to rights and freedoms',
        article: 'Art 33(1)',
        detail: 'No identifiability or severity recorded.',
      },
    ],
  },
]

/** The served verdicts over a part-filled record. The reading is the server's. */
export const WithVerdicts: Story = {
  name: 'The verdicts the answers produce',
  args: { record: partFilled(), verdicts: VERDICTS },
}

/** A 420px pane: the two-column grid drops to one. */
export const Narrow: Story = {
  name: 'A narrow pane',
  render: (args) => (
    <div className="w-[420px] border border-dashed border-border p-2">
      <ComplianceScreen {...args} />
    </div>
  ),
}

/** A competent authority and a recurring-series note past their controls. */
export const Overlong: Story = {
  name: 'A value too long for its control',
  args: {
    record: {
      ...partFilled(),
      competentAuthority:
        'Rijksinspectie Digitale Infrastructuur, Team Meldplicht Digitale Diensten en Vitale Aanbieders',
      recurringEarlierCases:
        'DEMO-2026-008, DEMO-2026-011, DEMO-2026-019 and DEMO-2026-024, all the same operator and the same initial access route',
    },
  },
}

/**
 * Every question on every card answered, which is the state a case reaches at
 * filing.
 *
 * The chip on each card reads the same number twice, and the form is at its
 * full length: every subordinate field is revealed by the ground above it, so
 * this is the tallest the screen ever gets.
 */
export const Complete: Story = {
  name: 'Every card answered',
  args: { record: fullyAnswered(), verdicts: VERDICTS },
  // The chip is the claim. A form counting a field it never drew reads as
  // finished on a record that is not.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badge = await canvas.findByText(/of \d+ answered/)
    const [set, total] = /(\d+) of (\d+)/.exec(badge.textContent)?.slice(1) ?? []
    await expect(Number(set)).toBe(Number(total))
  },
}

/**
 * An answer another analyst saved first.
 *
 * Above the progress bar and the cards, not inside the card the field belongs
 * to: a card folds shut once every question in it is answered, and a refusal
 * drawn inside a shut card is a refusal nobody sees.
 */
export const Refused: Story = {
  name: 'A refused write',
  args: { refusal: { field: 'Notified at', by: 'R. Okonkwo' } },
  play: async ({ canvasElement, canvas, step }) => {
    await step('the refusal names the field and who got there first', async () => {
      await expect(canvas.getByText(/Notified at/)).toBeVisible()
      await expect(canvas.getByText(/R\. Okonkwo/)).toBeVisible()
    })
    await step('and sits above the cards, where a folded one cannot hide it', async () => {
      // A card folds shut once every question in it is answered, so a refusal
      // drawn inside one is a refusal nobody sees.
      // Every card is folded here -- no `form-grid` is drawn at all -- and the
      // refusal is still on screen. That is the whole claim: inside a card it
      // would be shut away exactly when a card folds, which is the moment
      // every question in it has been answered.
      await expect(canvasElement.querySelectorAll('[data-slot="form-grid"]')).toHaveLength(0)
      await expect(canvas.getByText(/R\. Okonkwo/)).toBeVisible()
    })
  },
}

/** The write seam, spied on. One per story, since `fn` remembers its calls. */
function spying(): ComplianceWrites {
  return { save: fn(() => Promise.resolve({})) }
}

/**
 * An answer typed into a card, all the way through to the seam.
 *
 * An answer held in the screen's own draft and never sent looks identical to
 * one the server took, and this record is what a regulator is told.
 *
 * **The descriptor travels, not the field's name.** Six kinds share one
 * control and it emits a string for all of them, while the record stores an
 * array for the sets and null for an unanswered number -- so the conversion
 * needs the spec, and a seam handed a bare name has nothing to convert with.
 */
export const SendsAnAnswer: Story = {
  name: 'Sending a typed answer',
  args: { writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Competent authority'), 'RDI')

    await expect(args.writes!.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'competentAuthority', kind: 'text' }),
      'RDI',
    )
  },
}

/**
 * The same seam from a closed vocabulary, where the spec carries the options.
 *
 * The kind and the option list are the half of the descriptor the wire
 * conversion reads. A seam that sent the label the analyst pressed, or the
 * name alone, would look right on this screen and store a value the server
 * cannot place.
 */
export const SendsAChosenAnswer: Story = {
  name: 'Sending an answer from a vocabulary',
  args: { writes: spying() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /NIS2 classification/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'essential' }))

    await expect(args.writes!.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'nis2EntityClass',
        kind: 'select',
        options: expect.arrayContaining(['essential']),
      }),
      'essential',
    )
  },
}

/** The two cards an analyst fills first, answered; the findings left open. */
function partFilled(): ComplianceRecord {
  return {
    ...campaignCompliance,
    nis2EntityClass: 'essential',
    nis2EntityType: 'mssp',
    annualTurnoverEur: 184_000_000,
    competentAuthority: 'Rijksinspectie Digitale Infrastructuur',
    dpoContact: 'dpo@meridian.example',
    homeMemberState: 'NL',
    affectedMemberStates: ['NL', 'BE', 'DE'],
    serviceDowntimeMinutes: 4_310,
    serviceDowntimeComplete: true,
    usersAffectedCount: 1_240,
    usersTotalCount: 3_100,
    financialLossEur: 2_400_000,
    personalDataInvolved: 'yes',
    gdprAwareAt: '2026-08-13T16:16:41Z',
  }
}

/** Three grounds answered `no`, which is an answer and not a blank. */
function answeredNo(): ComplianceRecord {
  return {
    ...campaignCompliance,
    nis2SevereDisruption: 'no',
    nis2Death: 'no',
    doraCriticalFunctions: 'no',
  }
}

/** The record with every regulatory question on it answered. */
function fullyAnswered(): ComplianceRecord {
  return {
    ...partFilled(),
    outsideEuReach: true,
    outsideEuCountries: 'CH, UK',
    nis2Significance: 'significant',
    nis2SevereDisruption: 'yes',
    nis2ConsiderableDamage: 'no',
    nis2TradeSecretLoss: 'no',
    nis2Death: 'no',
    nis2HealthDamage: 'no',
    nis2MaliciousAccess: 'yes',
    unlawfulOrMalicious: 'suspected',
    usersAffected: 'Freight scheduling customers in NL, BE and DE',
    financialImpact: 'Ransom not paid; recovery and forensics billed to the incident',
    recurringIncident: 'yes',
    recurringEarlierCases: 'DEMO-2026-008 and DEMO-2026-011, the same operator',
    gdprDataContext: 'financial',
    gdprIdentifiability: 'maximum',
    gdprCircumstances: ['confidentiality', 'availability', 'malicious'],
    gdprSeverityOverride: 'high',
    gdprAuthorityNotifiedAt: '2026-08-15T09:00:00Z',
    gdprSubjectsNotifiedAt: '2026-08-18T11:30:00Z',
    gdprEncryptionApplied: 'no',
    gdprSubsequentMeasures: 'yes',
    gdprPublicCommunication: 'yes',
    doraThreatTechniques: ['Data encryption for impact, including ransomware'],
    doraRootCauseHigh: ['malicious actions'],
    doraRootCauseDetailed: ['Macro-enabled attachment opened by a finance user'],
    doraRootCauseAdditional: ['No application control on the finance workstations'],
    doraCriticalFunctions: 'yes',
    doraSupervisedServices: 'no',
    doraMaliciousAccess: 'yes',
    doraRelevantClients: 'yes',
    doraReputationalImpact: 'yes',
    doraDataAdverseImpact: 'yes',
    doraDurationMinutes: 4_310,
    doraCostsEur: 2_400_000,
  }
}
