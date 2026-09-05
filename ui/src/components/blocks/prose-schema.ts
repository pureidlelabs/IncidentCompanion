/**
 * What a document body may contain - the nodes, the marks, and nothing else.
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
 */
let scratch: Editor | null = null

export function markdownToHtml(markdown: string): string {
  scratch ??= new Editor({ extensions: proseExtensions(), content: '' })
  scratch.commands.setContent(markdown)
  return scratch.getHTML()
}
