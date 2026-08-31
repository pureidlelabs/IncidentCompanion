/**
 * The controlled vocabularies: the permitted values of a field, exported once
 * for every consumer - the schema, the form, the OpenAPI document and the
 * report all read the same list.
 *
 * Each is anchored to a published standard where one exists and names the
 * anchor; where none does, it says so rather than implying authority.
 */
import { z } from 'zod'

export * from './vocabularies.lists.js'
import * as lists from './vocabularies.lists.js'

export const severitySchema = z.enum(lists.SEVERITY)
export type Severity = z.infer<typeof severitySchema>

export const confidenceSchema = z.enum(lists.CONFIDENCE)
export type Confidence = z.infer<typeof confidenceSchema>

export const indicatorTypeSchema = z.enum(lists.INDICATOR_TYPE)
export type IndicatorType = z.infer<typeof indicatorTypeSchema>

export const dispositionSchema = z.enum(lists.DISPOSITION)
export type Disposition = z.infer<typeof dispositionSchema>

export const triageSchema = z.enum(lists.TRIAGE)
export type Triage = z.infer<typeof triageSchema>

export const assetVerdictSchema = z.enum(lists.ASSET_VERDICT)

export const taskStatusSchema = z.enum(lists.TASK_STATUS)

export const eventSourceSchema = z.enum(lists.EVENT_SOURCE)

export const taskTypeSchema = z.enum(lists.TASK_TYPE)

export const evidenceTypeSchema = z.enum(lists.EVIDENCE_TYPE)

export const systemTypeSchema = z.enum(lists.SYSTEM_TYPE)

export const zoneSchema = z.enum(lists.ZONE)

export const consentTypeSchema = z.enum(lists.CONSENT_TYPE)

export const verifiedPublisherSchema = z.enum(lists.VERIFIED_PUBLISHER)

export const tacticSchema = z.enum(lists.TACTIC)

export const ukcPhaseSchema = z.enum(lists.UKC_PHASE)

export const dataDispositionSchema = z.enum(lists.DATA_DISPOSITION)

export const dataCategorySchema = z.enum(lists.DATA_CATEGORY)

export const methodKindSchema = z.enum(lists.METHOD_KIND)

export const queryGrammarSchema = z.enum(lists.QUERY_GRAMMAR)

/**
 * A vocabulary an analyst may leave unanswered, where **unset is `''` and
 * never `null`** - the column is `text NOT NULL DEFAULT ''`.
 *
 * For a vocabulary whose "unanswered" is a real, storable state; a value that
 * genuinely does not exist yet takes a nullable column instead.
 */
export function unsettable<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.literal('')]).default('')
}

/**
 * A whole number an analyst may leave unanswered, accepting what an HTML form
 * sends for one: a string, or `''` for empty.
 *
 * **Empty reaches `null`, never `0`** - "nobody was affected" and "nobody has
 * counted" are different answers, and Art 33(3)(a) asks for a figure that is
 * often not known yet.
 */
export function optionalCount() {
  return z
    .preprocess(
      (raw) => {
        if (raw === '' || raw === null || raw === undefined) return null
        // Only a number or a string may be coerced: coercion reads `true` as 1
        // and `[]` as 0. Anything else passes through to be refused below.
        return typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : raw
      },
      z.number().int().min(0).nullable(),
    )
    .default(null)
}

/**
 * A closed vocabulary where "none of these" is a real answer: **`''` is what a
 * select sends and `null` is what the column holds**, so the two stay one
 * state rather than two spellings. A bare `z.enum(...).nullable()` refuses the
 * `''` its own route offers as the first option.
 */
export function optionalChoice<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .preprocess(
      (raw) => (raw === '' || raw === undefined ? null : raw),
      z.enum(values).nullable(),
    )
    .default(null)
}
