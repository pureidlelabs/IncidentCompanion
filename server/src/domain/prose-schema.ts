/**
 * The ProseMirror schema a report body is read through.
 */
import { getSchema } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { proseSchemaExtensions } from '@incidentcompanion/prose-schema'

export { proseSchemaExtensions }

let cached: Schema | null = null

/** The schema, built once. */
export function proseSchema(): Schema {
  return (cached ??= getSchema(proseSchemaExtensions()))
}
