/**
 * The case's own form - what the Overview screen draws and what a case PATCH
 * may set.
 *
 * **One schema for both, because the form posts what it draws.** `/api/specs`
 * serialises this into `case.fields` and `cases.dto` derives `patchCaseSchema`
 * from it, so a control that exists is a control the write accepts.
 *
 * What is here is the set of case columns an analyst sets and no other screen
 * owns - the compliance columns belong to the compliance surface.
 *
 * ## Three fields are deliberately absent, and each for its own reason
 *
 * - **`closedAt` is writable and has no control.** It is stamped when a case
 *   closes and cleared otherwise, so an editor for it would have to be gated on
 *   `status === 'closed'` - and a field descriptor has no slot for "gated by
 *   another field's value". It is named in `writable` so a client can tell
 *   *not a field* from *not described here*.
 * - **`rsitClass` and `rsitType` validate as a pair.** Changing the class alone
 *   leaves a combination the taxonomy refuses, and a one-field-at-a-time PATCH
 *   drops half the write - so they are in neither list and get their own route
 *   when compliance lands.
 * - **`ukcPhase` and friends are derivations, not columns**, and are not the
 *   case's anyway.
 *
 * -> `ui/src/api/specsResidual.ts`, which is the client's copy of this reasoning
 *   and is pinned against these lists by `specs.test.ts`.
 */
import { z } from 'zod'

import { envelopeSchema, field, readStamp } from './field-spec.js'
import { SEVERITY } from './vocabularies.js'
import { VERIS_ACTIONS } from './vocabularies/compliance.js'

/**
 * How the incident is classified, in VERIS' vocabulary.
 *
 * **`unknown` leads, and the rest is `VERIS_ACTIONS` unchanged.** A case is
 * classified when somebody knows, which is rarely at the moment it is opened -
 * so the honest opening value is a member of the vocabulary rather than an
 * empty select. Sharing the list with compliance is what keeps a case's class
 * and the report's action agreeing.
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
 *
 * **Three ways a read differs from a write, and each is a real distinction:**
 *
 * - **Stamps are ISO strings.** -> `readStamp`
 * - **Nothing is optional.** `.optional()` says a *writer* may omit a field;
 *   a reader always gets the column. Left in, every nullable field would be
 *   `string | null | undefined` and `wire.contract.test.ts` would refuse it
 *   against a column that is merely nullable.
 * - **It carries what the form deliberately does not.** `closedAt` has no
 *   control, `rsitClass`/`rsitType` are omitted because they validate as a
 *   pair, and `id`/`isDemo` are the server's. All five are *served*, so a type
 *   describing a read has to name them - which is the same split
 *   `timeline.ts` makes with `owned()`.
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
  })
  .required()

/**
 * A case as a read returns it, envelope included.
 *
 * **`caseId` is not in the envelope here, because the row *is* the case.**
 * Everything else a stored row carries is, so `wire.ts` can infer its type
 * instead of restating five fields beside a schema that already has them.
 */
export const caseReadSchema = caseRowSchema.extend(
  envelopeSchema.omit({ caseId: true }).shape,
)

/**
 * Writable through `PATCH /api/cases/{id}`.
 *
 * **The form's fields plus `closedAt`**, which is the one a client may set and
 * no control draws. Derived from the schema rather than listed, so a field
 * added above is writable without a second edit - the drift that
 * `case_settings_spec` had two lists for.
 */
export const CASE_WRITABLE: readonly string[] = [
  ...Object.keys(caseFormSchema.shape),
  'closedAt',
]
