/**
 * The ProseMirror schema a report body is read through.
 *
 * The extension list is `@incidentcompanion/prose-schema`, the one definition
 * the editor and the server share, so a construct an analyst can type is one
 * this can draw. Here the server turns that list into a `Schema` with
 * `getSchema` - server-side and non-collaborative, since the walk needs the
 * node and mark shapes, never the Yjs binding.
 *
 * -> `report/document/fragment.ts`, which reads a document through it
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
