/**
 * What a compliance PATCH may set.
 *
 * Derived from `caseComplianceSchema`, so the form and the write cannot
 * disagree - a hand-written list beside either saves nothing with no error to
 * read.
 *
 * **`patchSchema`, never `.partial()`**, which keeps the defaults and would
 * rewrite every unmentioned field.
 */
import { z } from 'zod'

import { caseComplianceSchema } from '../domain/entities/case-compliance.js'
import { patchSchema } from '../domain/field-spec.js'

export const patchComplianceSchema = patchSchema(caseComplianceSchema)

export type CompliancePatch = z.infer<typeof patchComplianceSchema>
