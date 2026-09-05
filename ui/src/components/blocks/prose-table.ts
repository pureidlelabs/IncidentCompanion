/**
 * The table node, with a markdown serialiser that does not lose the analyst's
 * text.
 */

import { Table } from '@tiptap/extension-table'

/**
 * One cell's literal text, escaped so markdown reads it back unchanged.
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
