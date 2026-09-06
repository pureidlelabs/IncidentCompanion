/**
 * The case API's contract, as Zod: one declaration that validates the request,
 * types the handler and publishes the schema.
 *
 * **`id` is absent from the create shape on purpose** - it is generated, and
 * accepting one restores the collision and the guessable URL.
 */
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { caseFormSchema } from '../domain/case.js'
import { patchSchema } from '../domain/field-spec.js'

/** Bounded because unbounded text in a list column is a rendering problem, not a storage one. */
const title = z.string().trim().min(1, 'A case needs a title.').max(200)

/**
 * The customer's ITSM ticket. **Not validated against a pattern**: every
 * customer numbers differently, and a regex here would refuse the one thing
 * this field exists to record.
 */
const reference = z.string().trim().max(64).optional()

export const createCaseSchema = z.object({
  title,
  reference,
  /**
   * A case template's `name`, which seeds the new case's checklist.
   *
   * **The name, not the content.** A caller handing over the actions directly
   * would be writing rows through a door that validates a case, and a template
   * would stop being the one place its checklist is defined.
   */
  template: z.string().trim().max(64).optional(),
  customer: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(4000).optional(),
  /**
   * Defaults to now when the case is raised as the incident is found.
   *
   * An ISO string and never `z.coerce.date()` - a published schema speaks the
   * wire's vocabulary, and the controller converts at the database boundary.
   */
  openedAt: z.iso.datetime().optional(),
})

export class CreateCaseDto extends createZodDto(createCaseSchema) {}

/**
 * What a case PATCH may set - derived from `caseFormSchema`, so it cannot
 * disagree with the form the Overview screen draws from `specs.case.fields`.
 *
 * `closedAt` is added here rather than drawn from the form: it has no control,
 * and it is writable rather than stamped, because a closed case with no
 * recorded time is a distinct state. -> `db/schema/case.ts`
 *
 * **`patchSchema`, never `.partial()`**, which leaves a `.default()` intact so
 * that patching one field rewrites every defaulted sibling.
 *
 * **`rsitClass`/`rsitType` must not be added here.** They validate as a pair
 * and go in one write; a one-field-at-a-time PATCH leaves a combination the
 * validator refuses, so they get their own route.
 */
export const patchCaseSchema = patchSchema(
  caseFormSchema.extend({ closedAt: z.coerce.date().nullable() }),
)

/**
 * What a case looks like on the wire.
 *
 * **Published in the API document but not applied to a response.** Every case
 * route still returns the Drizzle row, so this is the wire shape that is
 * wanted rather than a filter that is in force - a column added to the table
 * becomes public without passing through here.
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

