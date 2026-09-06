/**
 * The regulatory record - what NIS2, GDPR and DORA each need to be answered.
 *
 * **Facts, never verdicts.** Nothing here is "is this reportable". The analyst
 * supplies structured facts and the lens derives the determination, because
 * the alternative asks an analyst to make a legal call from memory - a bare
 * low/medium/high pick for the GDPR risk level is a judgement nothing on the
 * screen supports. The one exception is `gdprSeverityOverride`, which records
 * that a human disagreed with the computed band, and is a different fact from
 * the band itself.
 *
 * **Its own table, not columns on the case.** These are read by the compliance
 * lens and by the report, and by nothing else; the case header is drawn on
 * every screen, and a regulatory column nobody is looking at should not ride
 * along with it.
 *
 * **A customer's attributes are a snapshot, not a link.** `homeMemberState`,
 * `competentAuthority`, `dpoContact` and `annualTurnoverEur` are the customer's
 * facts and the registry is where they are *maintained* - but they are copied
 * here at the time of the incident, because a `.iccase` travels between installs
 * and a foreign key the receiving install cannot resolve is worse than a value.
 *
 * **Vocabularies are lifted from law, not chosen.**
 * -> `domain/vocabularies/compliance.ts`
 */
import { z } from 'zod'

import { field, readStamp } from '../field-spec.js'
import {
  DORA_ROOT_CAUSE_HIGH,
  DORA_THREAT_TECHNIQUES,
  EU_MEMBER_STATES,
  GDPR_CIRCUMSTANCES,
  GDPR_DATA_CONTEXTS,
  GDPR_IDENTIFIABILITY,
  GDPR_SEVERITY_BANDS,
  NIS2_ENTITY_CLASSES,
  NIS2_ENTITY_TYPES,
  NIS2_SIGNIFICANCE,
  NIS2_SUSPICION,
} from '../vocabularies/compliance.js'

const text = (max: number) => z.string().trim().max(max).default('')
const moment = () => readStamp().nullable().default(null)
const euros = () => z.number().int().min(0).nullable().default(null)
const minutes = () => z.number().int().min(0).nullable().default(null)

/** A tri-state the regulations ask in several places: yes, no, or not stated. */
const ground = () => z.enum(['yes', 'no']).nullable().default(null)

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((one) => one.value) as [string, ...string[]]

export const caseComplianceSchema = z.object({
  /** One code. Which state's authority leads. */
  homeMemberState: field(z.enum(EU_MEMBER_STATES).nullable().default(null), {
    label: 'Home member state',
    kind: 'select',
    vocabulary: 'memberState',
    section: {
      title: 'Reach',
      copy: 'Where the incident lands, which decides who has to be told.',
    },
  }),

  /** Several. NIS2 Art 23 asks which other states are affected. */
  affectedMemberStates: field(z.array(z.enum(EU_MEMBER_STATES)).default([]), {
    label: 'Other member states affected',
    kind: 'multi_device_select',
    vocabulary: 'memberState',
  }),

  outsideEuReach: field(z.boolean().default(false), {
    label: 'Reaches outside the EU',
    kind: 'checkbox',
    subordinate: true,
  }),

  /** Free text, deliberately: the world is not a closed list. */
  outsideEuCountries: field(text(500), {
    label: 'Countries outside the EU',
    kind: 'text',
    subordinate: true,
    enabledBy: 'outsideEuReach',
  }),

  competentAuthority: field(text(200), {
    label: 'Competent authority',
    kind: 'autocomplete',
    subordinate: true,
  }),

  /**
   * Whether NIS2 applies at all, and under which annex.
   *
   * **`out of scope` is an answer, and null is the absence of one.** Python
   * spells the unanswered state as a leading `''` inside the vocabulary, which
   * is why `NIS2_ENTITY_CLASSES` drops it on this side - a sentinel that is a
   * member reads as an assessment somebody made.
   */
  nis2EntityClass: field(z.enum(NIS2_ENTITY_CLASSES).nullable().default(null), {
    label: 'NIS2 classification',
    kind: 'select',
    vocabulary: 'nis2EntityClass',
    section: { title: 'NIS2', copy: 'What the entity is, and whether the incident is significant.' },
  }),
  nis2EntityType: field(z.enum(NIS2_ENTITY_TYPES).nullable().default(null), {
    label: 'Entity type',
    kind: 'select',
    vocabulary: 'nis2EntityType',
  }),

  /** Art 23: the determination itself, recorded rather than derived. */
  nis2Significance: field(z.enum(NIS2_SIGNIFICANCE).nullable().default(null), {
    label: 'Significant incident',
    kind: 'select',
    vocabulary: 'nis2Significance',
  }),

  /**
   * The six thresholds Art 23(3) and IR Art 3 name, each yes / no / unanswered.
   *
   * **Grounds rather than booleans, and the third state is the load-bearing
   * one.** A checkbox would record "no" for every threshold nobody has reached
   * yet - the answer that keeps an incident out of a notification.
   */
  nis2SevereDisruption: field(ground(), {
    label: 'Severe operational disruption (Art 23(3)(a))',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  nis2ConsiderableDamage: field(ground(), {
    label: 'Considerable damage to others (Art 23(3)(b))',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  nis2TradeSecretLoss: field(ground(), {
    label: 'Trade secrets exfiltrated (IR Art 3(1)(b))',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  nis2Death: field(ground(), {
    label: 'A person died (IR Art 3(1)(c))',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  nis2HealthDamage: field(ground(), {
    label: 'Considerable damage to health (IR Art 3(1)(d))',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  nis2MaliciousAccess: field(ground(), {
    label: 'Malicious access capable of severe disruption (IR Art 3(1)(e))',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),

  /** NIS2 Art 23(3): suspected unlawful or malicious, or not. */
  unlawfulOrMalicious: field(z.enum(NIS2_SUSPICION).nullable().default(null), {
    label: 'Suspected unlawful or malicious',
    kind: 'select',
    vocabulary: 'nis2Suspicion',
    section: { title: 'Impact', copy: 'What the incident cost, in the terms each regime asks.' },
  }),

  personalDataInvolved: field(ground(), {
    label: 'Personal data involved',
    kind: 'select',
    vocabulary: 'ground',
  }),

  usersAffected: field(text(200), { label: 'Users affected (description)', kind: 'text' }),
  usersAffectedCount: field(z.number().int().min(0).nullable().default(null), {
    label: 'Users affected (count)',
    kind: 'text',
  }),
  usersTotalCount: field(z.number().int().min(0).nullable().default(null), {
    label: 'Users in total',
    kind: 'text',
    subordinate: true,
  }),

  serviceDowntimeMinutes: field(minutes(), {
    label: 'Service downtime (minutes)',
    kind: 'text',
  }),
  /** Whether the outage was total. A partial degradation is a different limb. */
  serviceDowntimeComplete: field(z.boolean().default(false), {
    label: 'Service was completely down',
    kind: 'checkbox',
    subordinate: true,
  }),

  financialImpact: field(text(200), { label: 'Financial impact', kind: 'text', subordinate: true }),
  financialLossEur: field(euros(), { label: 'Financial loss (EUR)', kind: 'text', subordinate: true }),

  /** The 5% limb needs the customer's turnover, snapshotted at the incident. */
  annualTurnoverEur: field(euros(), {
    label: 'Customer annual turnover (EUR)',
    kind: 'text',
    subordinate: true,
  }),

  /**
   * **Asserted, never computed.** The app is single-case by design; a
   * cross-case index was considered and rejected. So recurrence is a flag plus
   * the earlier cases in the analyst's own words.
   */
  recurringIncident: field(ground(), {
    label: 'Recurring incident',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  recurringEarlierCases: field(text(1000), {
    label: 'Earlier cases',
    kind: 'textarea',
    subordinate: true,
    enabledBy: 'recurringIncident',
  }),

  /** DPC in the ENISA formula: what kind of data was exposed. */
  gdprDataContext: field(z.enum(values(GDPR_DATA_CONTEXTS)).nullable().default(null), {
    label: 'Data category',
    kind: 'select',
    vocabulary: 'gdprDataContext',
    section: {
      title: 'GDPR',
      copy: 'Facts the severity is computed from \u2014 the level is derived, not picked.',
    },
  }),

  /** EI: how readily the data names a person. */
  gdprIdentifiability: field(z.enum(values(GDPR_IDENTIFIABILITY)).nullable().default(null), {
    label: 'Identifiability',
    kind: 'select',
    vocabulary: 'gdprIdentifiability',
  }),

  /**
   * CB, and **several at once is normal** - exfiltrated *and* encrypted is
   * worse than either, which a one-of picker cannot express.
   */
  gdprCircumstances: field(z.array(z.enum(values(GDPR_CIRCUMSTANCES))).default([]), {
    label: 'Circumstances',
    kind: 'multi_device_select',
    vocabulary: 'gdprCircumstance',
  }),

  /**
   * **A recorded disagreement, not the answer.** The band is computed; this
   * says a human overrode it, which is itself a fact a regulator may ask about.
   */
  gdprSeverityOverride: field(z.enum(GDPR_SEVERITY_BANDS).nullable().default(null), {
    label: 'Severity (overridden)',
    kind: 'select',
    vocabulary: 'gdprSeverity',
    subordinate: true,
  }),

  /** Art 33's clock starts here, not at `openedAt`. */
  gdprAwareAt: field(moment(), { label: 'Became aware', kind: 'event_datetime' }),
  gdprAuthorityNotifiedAt: field(moment(), {
    label: 'Authority notified',
    kind: 'event_datetime',
    subordinate: true,
  }),
  gdprSubjectsNotifiedAt: field(moment(), {
    label: 'Data subjects notified',
    kind: 'event_datetime',
    subordinate: true,
  }),

  /** Art 34(3)(a)-(c): the three grounds for not telling the data subjects. */
  gdprEncryptionApplied: field(ground(), {
    label: 'Data unintelligible to others \u2014 Art 34(3)(a)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  gdprSubsequentMeasures: field(ground(), {
    label: 'Subsequent measures taken \u2014 Art 34(3)(b)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  gdprPublicCommunication: field(ground(), {
    label: 'Individual notice disproportionate \u2014 Art 34(3)(c)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),

  dpoContact: field(text(200), {
    label: 'DPO contact \u2014 Art 33(3)(b)',
    kind: 'text',
    subordinate: true,
  }),

  /** The ITS's own list. Several apply to one incident. */
  doraThreatTechniques: field(z.array(z.enum(DORA_THREAT_TECHNIQUES)).default([]), {
    label: 'Threat techniques',
    kind: 'multi_device_select',
    vocabulary: 'doraThreatTechnique',
    section: {
      title: 'DORA',
      copy: 'For a financial entity. The wording is the Regulation\u2019s, not ours.',
    },
  }),

  doraRootCauseHigh: field(z.array(z.enum(DORA_ROOT_CAUSE_HIGH)).default([]), {
    label: 'Root cause',
    kind: 'select',
    vocabulary: 'doraRootCauseHigh',
  }),
  doraRootCauseDetailed: field(z.array(z.string().trim().max(200)).default([]), {
    label: 'Root cause (detailed)',
    kind: 'multi_device_select',
    vocabulary: 'doraRootCauseDetailed',
    enabledBy: 'doraRootCauseHigh',
  }),
  doraRootCauseAdditional: field(z.array(z.string().trim().max(200)).default([]), {
    label: 'Root cause (additional)',
    kind: 'multi_device_select',
    vocabulary: 'doraRootCauseAdditional',
    enabledBy: 'doraRootCauseDetailed',
  }),

  doraCriticalFunctions: field(ground(), {
    label: 'Critical functions affected \u2014 Art 6(a)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  doraSupervisedServices: field(ground(), {
    label: 'Supervised services affected \u2014 Art 6(b)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  doraMaliciousAccess: field(ground(), {
    label: 'Malicious access \u2014 Art 6(c), 9(5)(b)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  doraRelevantClients: field(ground(), {
    label: 'Relevant clients affected \u2014 Art 9(1)(f)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  doraReputationalImpact: field(ground(), {
    label: 'Reputational impact \u2014 Art 9(2)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  doraDataAdverseImpact: field(ground(), {
    label: 'Adverse impact on data \u2014 Art 9(5)(a)',
    kind: 'select',
    vocabulary: 'ground',
    subordinate: true,
  }),
  doraDurationMinutes: field(minutes(), {
    label: 'Duration (minutes) \u2014 Art 9(3)(a)',
    kind: 'text',
    subordinate: true,
  }),
  doraCostsEur: field(euros(), {
    label: 'Costs and losses (EUR) \u2014 Art 9(6)',
    kind: 'text',
    subordinate: true,
  }),
})

export type CaseCompliance = z.infer<typeof caseComplianceSchema>
