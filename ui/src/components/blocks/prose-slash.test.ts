/**
 * The `/` menu's items, and the one thing about a snippet that can go wrong
 * silently: **arriving as flat text.**
 *
 * A snippet's body is markdown, and `insertContent` given a raw string is
 * happy to put `- Rotate the krbtgt account twice` on screen as a paragraph
 * beginning with a hyphen. It looks nearly right, it saves, and the export
 * prints a sentence where the report meant a list. Nothing goes red, so the
 * assertion is on the *nodes* the editor holds afterwards rather than on its
 * text.
 */

import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { proseExtensions } from './prose-schema'
import { blockItems, snippetItems, type SlashItem, type SnippetSource } from './prose-slash'

/** The one item, or a failure naming what came back instead. */
function only(items: SlashItem[]): SlashItem {
  expect(items).toHaveLength(1)
  const item = items[0]
  if (!item) throw new Error('snippetItems returned nothing')
  return item
}

function editorWith(markdown: string): Editor {
  return new Editor({ extensions: proseExtensions(), content: markdown })
}

const RECOMMENDATION: SnippetSource = {
  label: 'Rotate every credential in scope',
  group: 'Identity',
  hint: 'recovery',
  body: 'Rotate:\n\n- service accounts\n- the `krbtgt` account, twice\n',
}

describe('snippetItems', () => {
  it('files each snippet under its own group, so the menu can head it', () => {
    const item = only(snippetItems([RECOMMENDATION]))

    expect(item.group).toBe('Identity')
    expect(item.label).toBe(RECOMMENDATION.label)
    expect(item.hint).toBe('recovery')
    // The group's initial, not a shared mark: forty rows of the same glyph say
    // nothing about which group you are scrolling through.
    expect(item.glyph).toBe('I')
  })

  it('drops an empty hint rather than drawing a blank column', () => {
    const item = only(snippetItems([{ ...RECOMMENDATION, hint: '' }]))

    expect(item.hint).toBeUndefined()
  })

  it('inserts the body as markdown, not as a line beginning with a hyphen', () => {
    const editor = editorWith('')
    const item = only(snippetItems([RECOMMENDATION]))

    item.run(editor, { from: 0, to: 0 })

    const kinds: string[] = []
    editor.state.doc.descendants((node) => { kinds.push(node.type.name) })
    expect(kinds).toContain('bulletList')
    expect(kinds).toContain('listItem')
    // The inline code survives too - the schema has a mark for it, and a
    // hostname pasted as prose is the other half of the same failure.
    expect(editor.getHTML()).toContain('<code>krbtgt</code>')
    editor.destroy()
  })

})

describe('blockItems', () => {
  it('offers nothing the report refuses to draw', () => {
    // **A markdown spelling is not enough - the export has to draw it.** A node
    // that serialises happily and prints as one line of text passes the first
    // check and fails the second. Image is the standing example:
    // `report_markdown` refuses `![](...)` and always will, because an
    // attachment's `evidence/<sha256>` path is not a destination.
    const labels = blockItems().map((item) => item.label)

    expect(labels).toContain('Table')
    expect(labels).not.toContain('Image')
  })

  it('gives every item a group, since the heading is drawn from it', () => {
    for (const item of blockItems()) expect(item.group).toBeTruthy()
  })
})
