/**
 * A written section, resolved out of the report's own document.
 */
import type { Node as PmNode } from '@tiptap/pm/model'
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'

import {
  MAX_COLUMNS,
  MAX_DEPTH,
  MAX_LIST_LEVEL,
  MAX_ROWS,
  spanOf,
} from '../../domain/prose-bounds.js'
import { proseSchema } from '../../domain/prose-schema.js'
import { evenly, padded, paddedLabels } from './grid.js'
import type { Cell, ListItem, Node, Run, TableNode } from './model.js'

// Re-exported so this module stays the one door to a block's prose, while
// the field convention itself sits where both layers can reach it.
export { fragmentFor } from '../../domain/prose-fields.js'

/** What a mark is called in the editor's schema, in either spelling. */
const BOLD = new Set(['bold', 'strong'])
const ITALIC = new Set(['italic', 'em'])

interface Marks {
  bold?: boolean
  italic?: boolean
  code?: boolean
  url?: string
}

function marksOf(node: PmNode): Marks {
  const marks: Marks = {}
  for (const mark of node.marks) {
    const name = mark.type.name
    if (BOLD.has(name)) marks.bold = true
    if (ITALIC.has(name)) marks.italic = true
    if (name === 'code') marks.code = true
    if (name === 'link' && typeof mark.attrs['href'] === 'string') marks.url = mark.attrs['href']
  }
  return marks
}

/**
 * The runs under one node, marks resolved by the schema.
 */
function runsIn(node: PmNode, depth = 0): Run[] {
  if (depth > MAX_DEPTH) return []
  const runs: Run[] = []
  node.forEach((child) => {
    if (child.isText) {
      runs.push({ text: child.text ?? '', ...marksOf(child) })
    } else if (child.type.name === 'hardBreak') {
      runs.push({ text: ' ' })
    } else {
      runs.push(...runsIn(child, depth + 1))
    }
  })
  return runs
}

const textOf = (runs: Run[]): string => runs.map((run) => run.text).join('')

/** A run list as one line, keeping a link's address as `text (url)`. */
const flatten = (runs: Run[]): string =>
  runs.map((run) => (run.url && run.url !== run.text ? `${run.text} (${run.url})` : run.text)).join('')

/**
 * Every list item under a list node, flattened with its depth.
 */
function itemsIn(list: PmNode, level: number, ordered: boolean, into: ListItem[], depth: number): void {
  if (depth > MAX_DEPTH) return
  list.forEach((item) => {
    if (item.type.name !== 'listItem') return

    const runs: Run[] = []
    item.forEach((part) => {
      const name = part.type.name
      if (name === 'bulletList' || name === 'orderedList') return
      runs.push(...runsIn(part, depth + 1))
    })
    into.push({ runs, level: Math.min(level, MAX_LIST_LEVEL), ordered })

    item.forEach((part) => {
      if (part.type.name === 'bulletList') itemsIn(part, level + 1, false, into, depth + 1)
      if (part.type.name === 'orderedList') itemsIn(part, level + 1, true, into, depth + 1)
    })
  })
}

/** `left`, `right` or `center` if the cell carries one, in either spelling. */
function alignOf(cell: PmNode): Cell['align'] {
  const declared: unknown = cell.attrs['align'] ?? cell.attrs['alignment']
  return declared === 'right' || declared === 'center' || declared === 'left' ? declared : undefined
}

/** Everything one cell holds, as a single line: its blocks back through the walker. */
function textOfCell(cell: PmNode, depth: number): string {
  const parts: string[] = []
  for (const node of nodesOf(cell, depth + 1)) {
    switch (node.type) {
      case 'richPara':
      case 'quote':
        parts.push(flatten(node.runs))
        break
      case 'list':
        for (const item of node.items) parts.push(flatten(item.runs))
        break
      case 'code':
        parts.push(node.lines.join(' '))
        break
      case 'subhead':
      case 'minorHead':
        parts.push(node.text)
        break
      case 'table':
        for (const label of node.header ?? []) parts.push(label)
        for (const row of node.rows) for (const one of row) parts.push(one.text)
        break
      default:
        break
    }
  }
  return parts.map((part) => part.trim()).filter((part) => part !== '').join(' ')
}

/**
 * A table's cells, laid out on the grid the analyst sees.
 */
function tableOf(node: PmNode, depth: number): TableNode | null {
  let height = 0
  let over = false
  node.forEach((row) => {
    if (over || row.type.name !== 'tableRow') return
    height += 1
    if (height > MAX_ROWS) {
      over = true
      return
    }
    let width = 0
    row.forEach((cell) => {
      const name = cell.type.name
      if (name !== 'tableCell' && name !== 'tableHeader') return
      width += spanOf(cell.attrs['colspan'])
    })
    if (width > MAX_COLUMNS) over = true
  })
  if (over) return null

  const rows: Cell[][] = []
  let headed = false
  //: column -> what the rows below owe it, from a cell that spans into them.
  // `owner` is the top-left cell, so the rows it actually reaches can be counted
  // onto its `rowSpan`; `primary` marks its leftmost column, so a cell that
  // spans columns as well as rows counts each row once rather than per column.
  let carried = new Map<number, { left: number; owner: Cell; primary: boolean }>()

  node.forEach((row) => {
    if (row.type.name !== 'tableRow') return

    const placed: (Cell | undefined)[] = []
    const next = new Map<number, { left: number; owner: Cell; primary: boolean }>()
    for (const [column, owed] of carried) {
      // A covered column is blank; its span belongs to the owner above.
      placed[column] = { text: '' }
      if (owed.primary) owed.owner.rowSpan = (owed.owner.rowSpan ?? 1) + 1
      if (owed.left > 1) next.set(column, { left: owed.left - 1, owner: owed.owner, primary: owed.primary })
    }

    let onlyHeaders = true
    let seen = false
    let column = 0

    row.forEach((cell) => {
      const name = cell.type.name
      if (name !== 'tableCell' && name !== 'tableHeader') return
      seen = true
      if (name !== 'tableHeader') onlyHeaders = false

      while (placed[column] !== undefined) column += 1

      const align = alignOf(cell)
      const across = spanOf(cell.attrs['colspan'])
      const down = spanOf(cell.attrs['rowspan'])
      const here: Cell = {
        text: textOfCell(cell, depth),
        ...(align ? { align } : {}),
        // The column span is effective as declared: a colspan builds its own
        // columns. The row span starts at one and is counted up as the rows it
        // reaches are placed, because a rowspan reserves in rows that exist and
        // invents none - so a rowspan of 64 across two rows is a two-row merge.
        ...(across > 1 ? { colSpan: across } : {}),
      }

      for (let step = 0; step < across; step += 1) {
        // The value belongs to the first cell of the span; the rest of the
        // rectangle is blank so the columns after it stay where they are.
        placed[column + step] = step === 0 ? here : { text: '' }
        if (down > 1) next.set(column + step, { left: down - 1, owner: here, primary: step === 0 })
      }
      column += across
    })

    if (!seen && placed.length === 0) return
    carried = next

    const cells = Array.from(placed, (one) => one ?? { text: '' })
    if (rows.length === 0 && onlyHeaders) {
      headed = true
      rows.push(cells)
      return
    }
    rows.push(cells)
  })

  if (rows.length === 0) return null

  const header = headed ? rows[0]!.map((cell) => cell.text) : undefined
  const body = headed ? rows.slice(1) : rows
  const columns = Math.max(...body.map((row) => row.length), header?.length ?? 0)

  return {
    type: 'table',
    ...(header ? { header: paddedLabels(header, columns) } : {}),
    rows: body.map((row) => padded(row, columns)),
    widths: evenly(columns),
  }
}

/**
 * The nodes under one ProseMirror block container, in the neutral model.
 */
function nodesOf(parent: PmNode, depth = 0): Node[] {
  if (depth > MAX_DEPTH) return []
  const nodes: Node[] = []

  parent.forEach((child) => {
    const name = child.type.name

    if (name === 'paragraph') {
      const runs = runsIn(child, depth)
      if (textOf(runs).trim() !== '') nodes.push({ type: 'richPara', runs })
      return
    }

    if (name === 'heading') {
      const runs = runsIn(child, depth)
      const text = textOf(runs).trim()
      if (text === '') return
      const declared = Number(child.attrs['level'])
      const level = Number.isFinite(declared) ? declared : 2
      nodes.push(level <= 2 ? { type: 'subhead', text } : { type: 'minorHead', text })
      return
    }

    if (name === 'bulletList' || name === 'orderedList') {
      const items: ListItem[] = []
      itemsIn(child, 0, name === 'orderedList', items, depth)
      if (items.length > 0) nodes.push({ type: 'list', items })
      return
    }

    if (name === 'codeBlock') {
      const text = textOf(runsIn(child, depth))
      const language: unknown = child.attrs['language']
      nodes.push({
        type: 'code',
        lines: text.split('\n'),
        ...(typeof language === 'string' && language ? { language } : {}),
      })
      return
    }

    if (name === 'blockquote') {
      // One quote node per paragraph inside it: the editor stores a multi-line
      // quotation as its own paragraphs, and joining their runs would run the
      // last word of one into the first of the next. Consecutive quote nodes
      // paint as one indented block.
      child.forEach((part) => {
        const runs = runsIn(part, depth + 1)
        if (textOf(runs).trim() !== '') nodes.push({ type: 'quote', runs })
      })
      return
    }

    if (name === 'table') {
      const table = tableOf(child, depth)
      if (table) {
        nodes.push(table)
        return
      }
      // No `return` when there is nothing to draw: a table too large or empty
      // to build keeps its words through the unknown-block rule below.
    }

    if (name === 'horizontalRule') {
      nodes.push({ type: 'divider' })
      return
    }

    // Unknown blocks keep their words: a node this build does not draw is still
    // something an analyst typed.
    const runs = runsIn(child, depth)
    if (textOf(runs).trim() !== '') nodes.push({ type: 'richPara', runs })
  })

  return nodes
}

/**
 * One written section's nodes, from the fragment the editor writes into.
 */
export function nodesFromFragment(fragment: Y.XmlFragment): Node[] {
  let root: PmNode
  try {
    root = yXmlFragmentToProseMirrorRootNode(fragment, proseSchema())
  } catch {
    return []
  }
  return nodesOf(root, 0)
}
