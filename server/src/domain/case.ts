/**
 * The case's own form - what the Overview screen draws and what a case PATCH
 * may set.
 */
import { z } from 'zod'

import { envelopeSchema, field, readStamp } from './field-spec.js'
import { SEVERITY } from './vocabularies.js'
import { VERIS_ACTIONS } from './vocabularies/compliance.js'

/**
 * How the incident is classified, in VERIS' vocabulary.
 */
export const INCIDENT_CLASS = ['unknown', ...VERIS_ACTIONS] as const

/** A timestamp an analyst types, or leaves empty. */
const stamp = (label: string) =>
  field(z.coerce.date().nullable().optional(), {
    label,
    kind: 'event_datetime',
    fullWidth: false,
  })

/**
 * **Order is draw order**, as it is for every entity form: the object's keys
 * are what `serialise` walks, so the schema is written in the order the screen
 * reads.
 */
export const caseFormSchema = z.object({
  title: field(z.string().trim().min(1, 'A case needs a title.').max(300), {
    label: 'Title',
    kind: 'text',
    fullWidth: true,
  }),
  customer: field(z.string().trim().max(200).nullable().optional(), {
    label: 'Customer',
    kind: 'text',
  }),
  reference: field(z.string().trim().max(120).nullable().optional(), {
    label: 'Incident reference',
    kind: 'text',
  }),
  analyst: field(z.string().trim().max(200).default(''), {
    label: 'Analyst',
    kind: 'text',
  }),

  status: field(z.enum(['open', 'closed']).default('open'), {
    label: 'Status',
    kind: 'select',
    vocabulary: 'caseStatus',
  }),
  severity: field(z.enum(SEVERITY).nullable().optional(), {
    label: 'Severity',
    kind: 'select',
    vocabulary: 'severity',
  }),
  incidentClass: field(z.enum(INCIDENT_CLASS).nullable().optional(), {
    label: 'Incident class',
    kind: 'select',
    vocabulary: 'incidentClass',
  }),

  detectionSource: field(z.string().trim().max(200).default(''), {
    label: 'Detection source',
    kind: 'text',
  }),
  initialAccessVector: field(z.string().trim().max(200).default(''), {
    label: 'Initial access vector',
    kind: 'text',
  }),
  /** The contributing failure in words - never the interval between two stamps. */
  detectionGap: field(z.string().trim().max(2000).default(''), {
    label: 'Detection gap',
    kind: 'textarea',
    fullWidth: true,
  }),
  summary: field(z.string().trim().max(4000).nullable().optional(), {
    label: 'Summary',
    kind: 'textarea',
    fullWidth: true,
    section: {
      title: 'The story so far',
      copy: 'What happened, in the words the report will open with.',
    },
  }),

  openedAt: stamp('Case opened at'),
  detectedAt: stamp('Detected at'),
  containedAt: stamp('Contained at'),
  eradicatedAt: stamp('Eradicated at'),
  recoveredAt: stamp('Recovered at'),
})



/**
 * The case row as a read returns it - **derived from the form, not declared
 * beside it**, so `wire.ts` can infer the case type like every other row.
 */
export const caseRowSchema = caseFormSchema
  .extend({
    openedAt: readStamp(),
    detectedAt: readStamp().nullable(),
    containedAt: readStamp().nullable(),
    eradicatedAt: readStamp().nullable(),
    recoveredAt: readStamp().nullable(),
  })
  .extend({
    closedAt: readStamp().nullable(),
    // `rsit_class` is nullable and `rsit_type` is `NOT NULL DEFAULT ''`, so
    // "unanswered" is `null` for one and `''` for the other. Not a symmetry to
    // tidy: a class with no type is a real state, and the pair validates
    // together. -> `db/schema/case.ts`
    rsitClass: z.string().nullable(),
    rsitType: z.string(),
    id: z.uuid(),
    isDemo: z.boolean(),

    /**
     * The organisation the case is for.
     */
    customerId: z.uuid().nullable(),
  })
  .required()

/**
 * A case as a read returns it, envelope included.
 */
export const caseReadSchema = caseRowSchema.extend(
  envelopeSchema.omit({ caseId: true }).shape,
)

/**
 * Writable through `PATCH /api/cases/{id}`.
 */
export const CASE_WRITABLE: readonly string[] = [
  ...Object.keys(caseFormSchema.shape),
  'closedAt',
]
