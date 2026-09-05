/**
 * The case API's contract, as Zod: one declaration that validates the request,
 * types the handler and publishes the schema.
 */
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { caseFormSchema } from '../domain/case.js'
import { patchSchema } from '../domain/field-spec.js'

/** Bounded because unbounded text in a list column is a rendering problem, not a storage one. */
const title = z.string().trim().min(1, 'A case needs a title.').max(200)

/**
 * The customer's ITSM ticket.
 */
const reference = z.string().trim().max(64).optional()

export const createCaseSchema = z.object({
  title,
  reference,
  /**
   * A case template's `name`, which seeds the new case's checklist.
   */
  template: z.string().trim().max(64).optional(),
  customer: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(4000).optional(),
  /**
   * Defaults to now when the case is raised as the incident is found.
   */
  openedAt: z.iso.datetime().optional(),
})

export class CreateCaseDto extends createZodDto(createCaseSchema) {}

/**
 * What a case PATCH may set - derived from `caseFormSchema`, so it cannot
 * disagree with the form the Overview screen draws from `specs.case.fields`.
 */
export const patchCaseSchema = patchSchema(
  caseFormSchema.extend({ closedAt: z.coerce.date().nullable() }),
)

/**
 * What a case looks like on the wire.
 */
export const caseSchema = z.object({
  id: z.uuid(),
  reference: z.string().nullable(),
  customer: z.string().nullable(),
  title: z.string(),
  status: z.enum(['open', 'closed']),
  summary: z.string().nullable(),
  // ISO strings, for the reason given on `createCaseSchema.openedAt`: a `Date`
  // cannot be published as JSON Schema, and this schema is the API document.
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  isDemo: z.boolean(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
})

export type CaseView = z.infer<typeof caseSchema>
