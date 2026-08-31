/**
 * The table node, with a markdown serialiser that does not lose the analyst's
 * text.
 *
 * **`tiptap-markdown` ships one and it drops two things**: a `|` inside a cell
 * is written raw, so `ps aux | grep ssh` breaks the row; and every column's
 * alignment is written `---`, so `:---:` never survives a round trip. Both
 * losses are silent - nothing is red, and the cell is gone.
 *
 * **Registered in place of `TableKit`'s own table** (`TableKit.configure({
 * table: false })`), because two extensions of one name is a ProseMirror
 * schema error rather than an override.
 */

import { Table } from '@tiptap/extension-table'

/**
 * One cell's literal text, escaped so markdown reads it back unchanged.
 *
 * **The delimiter is the obvious half and it is not the whole set.** Writing
 * only `\|` left every other markdown-significant character raw, because
 * `renderInline` used to apply prosemirror-markdown's own `esc()` and this
 * function replaced it. A Windows UNC path measured the loss: `\\fs01\share`
 * came back mangled, since `\s` is an escape sequence on the way in.
 *
 * The set is prosemirror-markdown's, character for character, **including its
 * intraword `_` exception** - without that, `svc_admin_prod` is stored as
 * `svc\_admin\_prod`, and a hostname carrying underscores is far more common
 * in a SOC report than intraword emphasis.
 */
function escapeCell(text: string): string {
  const escaped = text.replace(/[`*\\~[\]_]/g, (found, at: number) =>
    found === '_'
    && at > 0
    && at + 1 < text.length
    && /\w/.test(text[at - 1] ?? '')
    && /\w/.test(text[at + 1] ?? '')
      ? found
      : `\\${found}`)
  // After the backslash pass, so the one this adds is not doubled.
  return escaped.replace(/\|/g, '\\|')
}

/**
 * A link's address, which is escaped by different rules than its text.
 *
 * Only the two characters that would end the `(...)` early, plus the cell
 * delimiter. Running `escapeCell` over a URL would backslash every underscore
 * and asterisk in a query string, which markdown then reads back as literal
 * backslashes - a corrupted address rather than a preserved one.
 */
function escapeHref(href: string): string {
  return href.replace(/[()|]/g, (found) => `\\${found}`)
}

/** GFM's delimiter cell for one column's alignment. */
function delimiter(align: string | null): string {
  if (align === 'center') return ':---:'
  if (align === 'right') return '---:'
  return '---'
}

/**
 * One cell's markdown.
 *
 * **A cell holds `block+`, not one paragraph.** Reading `firstChild` was the
 * first shape of this function and it lost, silently and on the first save:
 * everything after an Enter (ProseMirror's default `splitBlock`, which nothing
 * in `prose-keys` overrides), every item of a pasted list, and a heading or a
 * quote somebody put in a cell. None of those is spellable in markdown, which
 * is why the corpus could not see them.
 *
 * So every block is walked to its text, and the blocks are joined with a
 * space: a table row is one line, and there is no markdown for a paragraph
 * break inside a cell. A hard break is a space for the same reason -
 * contributing nothing glued `DC-01` to `second line`, one word where the
 * analyst wrote two.
 *
 * **Written out rather than handed to `renderInline`.** That writes straight
 * into the shared stream, leaving no rendered string to escape; capturing it
 * by swapping `state.out` corrupts the serialiser's bookkeeping, measured as a
 * dropped row in DEMO-TELECOM's breach table. And `escapeExtraCharacters`,
 * which would have let the library do it, is not passed through by
 * `tiptap-markdown`'s serializer.
 */
function cellMarkdown(cell: CellNode | null | undefined): string {
  const blocks: string[] = []

  const walk = (node: InlineNode) => {
    // Collected first: a flag set inside the callback is invisible to the
    // type checker, which then calls the branch that reads it unreachable.
    const children: InlineNode[] = []
    node.content?.forEach((child) => { children.push(child) })

    const holdsText = children.some(
      (child) => child.isText === true || child.type?.name === 'hardBreak')
    if (holdsText) {
      const text = inlineOf(node)
      // `trim()`, not truthiness: a paragraph holding only a hard break
      // serialises to `' '`, which is truthy, and joining it between two real
      // blocks put three spaces in the cell.
      if (text.trim()) blocks.push(text)
      return
    }
    children.forEach(walk)
  }
  if (cell) walk(cell)
  return blocks.join(' ')
}

/**
 * One block's inline content, with the schema's closed mark set applied.
 *
 * Innermost first - `code` inside emphasis, a link wrapping the lot. **A link
 * spanning several text nodes is wrapped once**, not once per node: a partly
 * bold link came out as two anchors at the same address, which is the app
 * rewriting the analyst's text to say something it did not say.
 */
function inlineOf(block: InlineNode): string {
  const out: string[] = []
  let linked: { href: string; text: string } | null = null

  const flush = () => {
    if (linked) {
      out.push(`[${linked.text}](${escapeHref(linked.href)})`)
      linked = null
    }
  }

  block.content?.forEach((child) => {
    if (child.type?.name === 'hardBreak') {
      flush()
      out.push(' ')
      return
    }
    if (!child.isText) {
      // A nested inline node with no text of its own. **Break-verify on this
      // line comes back green**: `cellMarkdown`'s walk already reaches a list
      // or a quote by recursing through the blocks, so nothing in the current
      // schema arrives here - bulletList and listItem are blocks, and a mark
      // is not a node. Kept rather than deleted because dropping an inline
      // node a later schema gains would be silent, and recursing is the answer
      // that loses nothing. Recorded rather than tested: there is no input
      // that isolates it.
      flush()
      out.push(inlineOf(child))
      return
    }
    let text = escapeCell(child.text ?? '')
    const marks = new Set((child.marks ?? []).map((mark) => mark.type.name))
    if (marks.has('code')) text = `\`${text}\``
    if (marks.has('bold')) text = `**${text}**`
    if (marks.has('italic')) text = `*${text}*`

    const href = (child.marks ?? [])
      .find((mark) => mark.type.name === 'link')?.attrs?.href
    if (!href) {
      flush()
      out.push(text)
      return
    }
    if (linked?.href === href) linked.text += text
    else {
      flush()
      linked = { href, text }
    }
  })
  flush()
  return out.join('')
}

interface MarkNode {
  type: { name: string }
  attrs?: { href?: string | null }
}

interface InlineNode {
  isText?: boolean
  text?: string | null
  type?: { name: string }
  marks?: MarkNode[]
  content?: { forEach(each: (child: InlineNode) => void): void }
}

interface CellNode {
  content?: { forEach(each: (child: InlineNode) => void): void }
  attrs?: { alignment?: string | null; align?: string | null }
}

interface RowNode {
  forEach(each: (cell: CellNode) => void): void
}

interface TableNode {
  forEach(each: (row: RowNode, offset: number, index: number) => void): void
}

interface SerializerState {
  inTable: boolean
  write(text: string): void
  ensureNewLine(): void
  closeBlock(node: TableNode): void
}

export const ProseTable = Table.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: TableNode) {
          // **A merged cell degrades rather than corrupting.** Upstream fell
          // back to raw HTML for a table with a colspan, which is no use here:
          // `html: false` strips it on the way back in, so the fallback is a
          // deletion wearing a rescue. A spanned cell is simply counted once
          // and the row comes out short, which GFM reads back as a table with
          // empty cells. Nothing in the app can create one - the `/` menu
          // inserts a plain 3x3 and the table toolbar offers no merge - so
          // this is the shape of a body edited by hand.
          state.inTable = true
          node.forEach((row, _offset, index) => {
            const cells: string[] = []
            const aligns: string[] = []
            row.forEach((cell) => {
              cells.push(cellMarkdown(cell).trim())
              aligns.push(cell.attrs?.alignment ?? cell.attrs?.align ?? 'left')
            })
            state.write(`| ${cells.join(' | ')} |`)
            state.ensureNewLine()
            if (index === 0) {
              state.write(`| ${aligns.map(delimiter).join(' | ')} |`)
              state.ensureNewLine()
            }
          })
          state.closeBlock(node)
          state.inTable = false
        },
        parse: {
          // markdown-it's, unchanged: reading a table was never the problem.
        },
      },
    }
  },
})
