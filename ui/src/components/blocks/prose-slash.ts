/**
 * The `/` menu: one door to everything a body can hold.
 */

import Suggestion from '@tiptap/suggestion'
import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'

export interface SlashItem {
  group: string
  label: string
  hint?: string
  /** Two characters at most: it sits in a 1.5rem column. */
  glyph: string
  run: (editor: Editor, range: Range) => void
}

export type SlashCommand = (item: SlashItem) => void

function noop(): void {
  return undefined
}

/** What any prose body can hold, in the order someone reaches for it. */
export function blockItems(): SlashItem[] {
  return [
    { group: 'Blocks', label: 'Subhead', glyph: 'H2',
      run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 2 }).run() },
    { group: 'Blocks', label: 'Minor head', glyph: 'H3',
      run: (e, r) => e.chain().focus().deleteRange(r).setNode('heading', { level: 3 }).run() },
    { group: 'Blocks', label: 'Bulleted list', glyph: '\u2022',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
    { group: 'Blocks', label: 'Numbered list', glyph: '1.',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
    { group: 'Blocks', label: 'Quote', glyph: '\u275d',
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
    // Three columns and a header row, because a two-column table is a list and
    // an analyst who wants more can add them.
    { group: 'Blocks', label: 'Table', hint: '3 columns', glyph: '\u229e',
      run: (e, r) => e.chain().focus().deleteRange(r)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  ]
}

/**
 * **The body goes in as the markdown it is, never pre-rendered.**
 */
export function snippetItems(snippets: readonly SnippetSource[]): SlashItem[] {
  return snippets.map((snippet) => ({
    group: snippet.group,
    label: snippet.label,
    // Spread rather than `hint: ... || undefined`: under
    // `exactOptionalPropertyTypes` an explicit `undefined` is not an absent key.
    ...(snippet.hint ? { hint: snippet.hint } : {}),
    glyph: snippet.group.slice(0, 1).toUpperCase(),
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(snippet.body).run()
    },
  }))
}

export interface SnippetSource {
  label: string
  group: string
  hint: string
  body: string
}

export interface SlashHooks {
  items: () => SlashItem[]
  onOpen: (items: SlashItem[], at: DOMRect, run: SlashCommand) => void
  onUpdate: (items: SlashItem[], at: DOMRect, run: SlashCommand) => void
  onClose: () => void
  /** Return true when the menu consumed the key. */
  onKey: (event: KeyboardEvent) => boolean
}

export function SlashMenu(hooks: SlashHooks) {
  return Extension.create({
    name: 'proseSlash',
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          // Only at the start of a line: a date like `12/03` and a path like
          // `C:/Users` are both ordinary text in an incident report, and a menu
          // opening inside them is the editor arguing with the analyst.
          startOfLine: true,
          items: ({ query }) => {
            const all = hooks.items()
            if (!query) return all
            const needle = query.toLowerCase()
            // Group as well as label and hint. With a six-item menu the
            // heading was decoration; with the snippet library behind it
            // `/caveat` and `/ident` are how you reach a group at all.
            return all.filter((item) =>
              item.label.toLowerCase().includes(needle)
              || (item.hint ?? '').toLowerCase().includes(needle)
              || item.group.toLowerCase().includes(needle))
          },
          render: () => {
            // **`props.command`, never the item's own `run`.** Calling `run`
            // directly leaves the typed `/serv` behind in the document -
            // Suggestion owns the range it is going to delete.
            // Replaced on the first `onStart`; a click that somehow arrives
            // before one has nothing to run, which is better than a crash.
            let command: SlashCommand = noop
            const at = (props: { clientRect?: (() => DOMRect | null) | null }) =>
              props.clientRect?.() ?? new DOMRect()
            return {
              onStart: (props) => {
                command = (item) => props.command(item)
                hooks.onOpen(props.items, at(props), command)
              },
              onUpdate: (props) => {
                command = (item) => props.command(item)
                hooks.onUpdate(props.items, at(props), command)
              },
              onKeyDown: ({ event }) => hooks.onKey(event),
              onExit: () => hooks.onClose(),
            }
          },
          command: ({ editor, range, props }) => {
            (props as unknown as SlashItem).run(editor, range)
          },
        }),
      ]
    },
  })
}
