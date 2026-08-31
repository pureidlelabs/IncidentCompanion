/**
 * What a report body may contain: the one definition the editor and the server
 * build from.
 *
 * The client's editor decides what an analyst may type; the server's walk
 * decides what a report can draw. Those are the same question, and TipTap warns
 * that content its schema does not declare breaks synchronisation silently - so
 * the two must read one list. This package holds the node and mark definitions
 * and nothing about editing: the editor composes markdown, a character count
 * and collaboration on top, and the server turns the same list into a `Schema`
 * with `getSchema`.
 *
 * Shared as a package rather than a copy because a same-language client and
 * server share the schema module - the documented ProseMirror/TipTap practice -
 * where a cross-language pair would serialise it instead.
 */
import type { Node as TiptapNode } from '@tiptap/core'
import { Table, TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'

/**
 * The extensions that define the document, in the order both tiers use.
 *
 * @param collaborative Drop StarterKit's own history: `Collaboration` installs
 *   the Yjs undo manager, and two history plugins both answer Ctrl+Z - the
 *   ProseMirror one reverses another analyst's steps.
 * @param table The table node, separated from `TableKit` so the editor can pass
 *   its markdown-serialising variant. The node spec is identical, which is what
 *   makes the swap safe; the server passes the plain `Table`.
 */
export function proseSchemaExtensions(collaborative = false, table: TiptapNode = Table) {
  return [
    StarterKit.configure({
      ...(collaborative ? { undoRedo: false as const } : {}),
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    TableKit.configure({ table: false }),
    table,
  ]
}
