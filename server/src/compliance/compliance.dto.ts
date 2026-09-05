/**
 * What a compliance PATCH may set.
 */
import { z } from 'zod'

import { caseComplianceSchema } from '../domain/entities/case-compliance.js'
import { patchSchema } from '../domain/field-spec.js'

export const patchComplianceSchema = patchSchema(caseComplianceSchema)

export type CompliancePatch = z.infer<typeof patchComplianceSchema>
