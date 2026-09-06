/**
 * What the incident itself was - the case's own facts, above any regime.
 *
 * **Separate from the compliance record on purpose.** These are read by every
 * screen and by the report's narrative; the regulatory fields are read by the
 * compliance lens and nothing else. Keeping them apart is what stops a case
 * document dragging forty regulatory columns to draw a header.
 *
 * **Absence is null, never a sentinel.** `unknown` is a real VERIS value, so
 * defaulting `incidentClass` to it puts a claim on a report that nobody made
 * and needs a helper to strip again. A field nobody answered is null.
 *
 * **The four response times are the incident's clock, not the row's** - a
 * regulator's timeline is built from them, where `createdAt` is when somebody
 * opened the app. `detectionGap` is written rather than derived from them; see
 * the field.
 *
 * **Nothing imports this module.** The regulatory record took its own shape in
 * `case-compliance.ts`; what is served ahead of this is `verisAction`.
 * -> `specs/specs.controller.ts`
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
   * **VERIS, and the RSIT class is derived from it as a default.** The two are
   * separate fields because no standards body publishes the mapping between
   * them - the app once emitted five of eleven RSIT classes through a table it
   * had invented, and was asserting them to regulators.
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
   *
   * **One scale for a case and for a timeline entry.** Two would put the same
   * word at a different position on each, and leave `info` and `informational`
   * as one grade spelled twice. -> `domain/vocabularies.ts`
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
   * **Written, not derived.** It is the contributing *failure* - "no EDR on the
   * jump host" - rather than the interval between two of the timestamps above,
   * which is arithmetic anyone can do. The report's root-cause section renders
   * it as prose.
   */
  detectionGap: field(text(500), {
    label: 'Detection gap',
    kind: 'textarea',
    subordinate: true,
  }),
})

export type CaseFacts = z.infer<typeof caseFactsSchema>
