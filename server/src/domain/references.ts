/**
 * Which of a schema's fields point at another collection's rows.
 */
import type { z } from 'zod'

import { fields, identityReferences } from './field-spec.js'

export interface ReferenceField {
  /** The property on the row. */
  readonly field: string
  /** The collection it points at, in the spelling `refTarget` uses. */
  readonly target: string
}

/** Every reference field on a schema, in declaration order. */
export function referenceFieldsOf(schema: z.ZodObject): ReferenceField[] {
  return Object.entries(schema.shape).flatMap(([field, sub]) => {
    // Both registries: a picked reference carries its target on the control's
    // metadata, an identity one has no control to carry it. Missing the second
    // is what left `report_blocks.reportId` unchecked.
    const meta = sub as z.ZodType
    const target = fields.get(meta)?.refTarget ?? identityReferences.get(meta)?.refTarget
    return target ? [{ field, target }] : []
  })
}

/**
 * The ids a value carries, whether it is one reference or a list of them.
 */
export function idsIn(given: unknown): string[] {
  return (Array.isArray(given) ? given : [given]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
}
