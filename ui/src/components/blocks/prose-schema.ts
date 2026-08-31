/**
 * What a document body may contain - the nodes, the marks, and nothing else.
 *
 * Its own module so the round-trip guard imports the real list rather than
 * an equivalent one assembled for the test, which would certify a schema
 * nobody ships. React stays out of this file so importing it costs a test
 * nothing.
 *
 * `TableKit` is here because of one real body: DEMO-TELECOM's GDPR Art. 33/34
 * breach table, which a table-less schema returned as one unreadable run.
 *
 * The schema is what neutralises pasted markup, not the `Markdown`
 * extension's `html: false` flag.
 */

import { Editor } from '@tiptap/core'
import { proseSchemaExtensions } from '@incidentcompanion/prose-schema'

import { ProseTable } from './prose-table'
import { CharacterCount } from '@tiptap/extensions/character-count'
import { Markdown } from 'tiptap-markdown'

/**
 * The editor's extensions: the shared node and mark definitions, plus what
 * only an editor needs.
 *
 * The nodes and marks come from `@incidentcompanion/prose-schema`, the one
 * list the server reads a report through, so a construct an analyst can type
 * is one the report can draw. `ProseTable` is passed as the table node -- the
 * same spec with a markdown serialiser, since tiptap-markdown's own loses a
 * pipe inside a cell and every column's alignment. Markdown and the
 * character count are the editor's alone. -> `server/src/report/document/fragment.ts`
 *
 * @param collaborative Drop StarterKit's own history, which the shared list
 *   does: `Collaboration` installs the Yjs undo manager, and two history
 *   plugins both answering Ctrl+Z means the ProseMirror one reverses another
 *   analyst's steps.
 */
export function proseExtensions(collaborative = false) {
  return [
    ...proseSchemaExtensions(collaborative, ProseTable),
    Markdown.configure({ html: false, linkify: false, breaks: false }),
    CharacterCount,
  ]
}

/** `tiptap-markdown` 0.9 augments no types, unlike `@tiptap/extensions`. */
export interface MarkdownStorage {
  markdown: { getMarkdown: () => string }
}

export function markdownOf(editor: { storage: unknown }): string {
  return (editor.storage as MarkdownStorage).markdown.getMarkdown()
}

/**
 * Markdown as the HTML this schema renders it to.
 *
 * One editor, reused, and never mounted: a live paper column re-renders on
 * every keystroke across every section, and constructing a ProseMirror
 * *view* per section per keystroke makes typing stutter. A headless `Editor`
 * has no element and no view.
 *
 * The schema is the sanitiser here too.
 */
let scratch: Editor | null = null

export function markdownToHtml(markdown: string): string {
  scratch ??= new Editor({ extensions: proseExtensions(), content: '' })
  scratch.commands.setContent(markdown)
  return scratch.getHTML()
}
