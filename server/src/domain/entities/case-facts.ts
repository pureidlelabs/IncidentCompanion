/**
 * What the incident itself was - the case's own facts, above any regime.
 */
import { z } from 'zod'

import { field, readStamp } from '../field-spec.js'
import { severitySchema } from '../vocabularies.js'
import { RSIT_CLASSES, VERIS_ACTIONS } from '../vocabularies/compliance.js'

const text = (max: number) => z.string().trim().max(max).default('')
/** Nullable and defaulted: an unanswered stamp is a real state. -> `readStamp` */
const moment = () => readStamp().nullable().default(null)

/** The classes, as a Zod enum. Lifted from ENISA's taxonomy, not retyped. */
export const rsitClassSchema = z.enum(
  RSIT_CLASSES.map((one) => one.value) as [string, ...string[]],
)

export const verisActionSchema = z.enum(VERIS_ACTIONS)

export const caseFactsSchema = z.object({
  analyst: field(text(120), {
    label: 'Lead analyst',
    kind: 'autocomplete',
  }),

  /**
   * **VERIS, and the RSIT class is derived from it as a default.**
   */
  incidentClass: field(verisActionSchema.nullable().default(null), {
    label: 'Incident class (VERIS)',
    kind: 'select',
    vocabulary: 'verisAction',
  }),

  rsitClass: field(rsitClassSchema.nullable().default(null), {
    label: 'ENISA RSIT class',
    kind: 'select',
    vocabulary: 'rsitClass',
    section: {
      title: 'Classification',
      copy: 'What kind of incident this is, in the taxonomies a report cites.',
    },
  }),

  /** Which type, within the class. The options depend on the class chosen. */
  rsitType: field(text(64), {
    label: 'RSIT type',
    kind: 'select',
    vocabulary: 'rsitType',
    enabledBy: 'rsitClass',
  }),

  /**
   * How bad the incident is, overall.
   */
  severity: field(severitySchema.nullable().default(null), {
    label: 'Severity',
    kind: 'select',
    vocabulary: 'severity',
  }),

  detectionSource: field(text(120), {
    label: 'How it was detected',
    kind: 'autocomplete',
    subordinate: true,
    section: {
      title: 'Detection and response',
      copy: 'The incident\u2019s own clock \u2014 what a regulator\u2019s timeline is built from.',
    },
  }),

  initialAccessVector: field(text(200), {
    label: 'Initial access vector',
    kind: 'autocomplete',
    subordinate: true,
  }),

  /** When the SOC first saw it, which is not when the case was opened. */
  detectedAt: field(moment(), {
    label: 'Detected at',
    kind: 'event_datetime',
    subordinate: true,
  }),
  containedAt: field(moment(), {
    label: 'Contained at',
    kind: 'event_datetime',
    subordinate: true,
  }),
  eradicatedAt: field(moment(), {
    label: 'Eradicated at',
    kind: 'event_datetime',
    subordinate: true,
  }),
  recoveredAt: field(moment(), {
    label: 'Recovered at',
    kind: 'event_datetime',
    subordinate: true,
  }),

  /**
   * **Written, not derived.**
   */
  detectionGap: field(text(500), {
    label: 'Detection gap',
    kind: 'textarea',
    subordinate: true,
  }),
})

export type CaseFacts = z.infer<typeof caseFactsSchema>
