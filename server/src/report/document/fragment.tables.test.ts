/**
 * Tables an analyst pasted into a written section.
 */
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { nodesFromFragment } from './fragment.js'
import type { TableNode } from './model.js'

/** An element with children, as TipTap stores one, attributes as strings. */
function element(name: string, children: (Y.XmlElement | Y.XmlText)[], attrs: Record<string, string> = {}) {
  const node = new Y.XmlElement(name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  node.insert(0, children)
  return node
}
function text(value: string) {
  const node = new Y.XmlText()
  node.insert(0, value)
  return node
}
function resolve(build: (fragment: Y.XmlFragment) => void) {
  const doc = new Y.Doc({ gc: false })
  const fragment = doc.getXmlFragment('block')
  build(fragment)
  return nodesFromFragment(fragment)
}
const cell = (name: string, value: string, attrs: Record<string, string> = {}) =>
  element(name, [element('paragraph', [text(value)])], attrs)

describe('a pasted table', () => {
  it('draws as a table, not one paragraph of run-together cells', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [cell('tableHeader', 'Article'), cell('tableHeader', 'Obligation')]),
          element('tableRow', [cell('tableCell', 'Art. 33'), cell('tableCell', 'Notify the authority')]),
          element('tableRow', [cell('tableCell', 'Art. 34'), cell('tableCell', 'Tell the data subject')]),
        ]),
      ])
    })
    expect(nodes).toHaveLength(1)
    const table = nodes[0] as TableNode
    expect(table.header).toEqual(['Article', 'Obligation'])
    expect(table.rows.map((row) => row.map((one) => one.text))).toEqual([
      ['Art. 33', 'Notify the authority'],
      ['Art. 34', 'Tell the data subject'],
    ])
    expect(table.widths).toHaveLength(2)
    expect(table.widths.reduce((total, share) => total + share, 0)).toBeCloseTo(1)
  })

  it('keeps a table whose first row is data, with no header', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [cell('tableCell', 'Reference'), cell('tableCell', 'INC-2026-0042')]),
        ]),
      ])
    })
    const table = nodes[0] as TableNode
    expect(table.header).toBeUndefined()
    expect(table.rows[0]!.map((one) => one.text)).toEqual(['Reference', 'INC-2026-0042'])
  })

  it('joins two paragraphs in a cell with a space rather than gluing the words', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [
            element('tableCell', [
              element('paragraph', [text('First sentence.')]),
              element('paragraph', [text('Second sentence.')]),
            ]),
          ]),
        ]),
      ])
    })
    expect((nodes[0] as TableNode).rows[0]![0]!.text).toBe('First sentence. Second sentence.')
  })

  it('pads a row a merged cell left short, because pdfmake refuses a ragged one', () => {
    // pdfmake throws `Malformed table row` on a ragged row, failing the whole
    // report; Word renders it short. So the grid is squared: the merged cell's
    // value sits in the first column and the rest of its span is blank.
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [cell('tableHeader', 'Article'), cell('tableHeader', 'Obligation')]),
          element('tableRow', [cell('tableCell', 'Both columns', { colspan: '2' })]),
          element('tableRow', [cell('tableCell', 'Art. 34'), cell('tableCell', 'Tell the data subject')]),
        ]),
      ])
    })
    const table = nodes[0] as TableNode
    for (const row of table.rows) expect(row).toHaveLength(2)
    expect(table.rows[0]!.map((one) => one.text)).toEqual(['Both columns', ''])
    // The span rides the top-left cell so Word can merge; the blank stays for
    // pdfmake, which pads rather than merges.
    expect(table.rows[0]![0]!.colSpan).toBe(2)
  })

  it.each([
    ['0', 1], ['-3', 1], ['abc', 1], ['2.9', 1], ['', 1], [' 2 ', 1],
    ['Infinity', 1], ['1e3', 1], ['0x10', 1], ['2', 2], ['64', 64],
    ['10000000', 64],
  ])('reads colspan %s as %i columns and keeps the value', (declared, columns) => {
    // colspan=10,000,000 is a V8 heap OOM if used as an allocation size, and it
    // reaches the CRDT verbatim. The parse is HTML's (1e3 and 0x10 are one),
    // the ceiling is MAX_SPAN, and the cell's word survives whatever the span.
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [element('tableRow', [cell('tableCell', 'wide', { colspan: declared })])]),
      ])
    })
    const table = nodes[0] as TableNode
    expect(table.widths).toHaveLength(columns)
    expect(table.rows[0]).toHaveLength(columns)
    expect(table.rows[0]![0]!.text).toBe('wide')
  })

  it('clamps a rowspan and keeps the row it spans from', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [
            cell('tableCell', 'tall', { rowspan: '10000000' }),
            cell('tableCell', 'beside'),
          ]),
          element('tableRow', [cell('tableCell', 'below')]),
        ]),
      ])
    })
    const table = nodes[0] as TableNode
    // A rowspan reserves columns in rows that exist; it invents none, so the
    // clamp shows up as the table still being two rows.
    expect(table.rows.map((row) => row.map((one) => one.text))).toEqual([
      ['tall', 'beside'],
      ['', 'below'],
    ])
    // The effective span is two rows, not the clamped 64: a rowspan of 64
    // across two rows is a two-row merge, and it is that number Word needs.
    expect(table.rows[0]![0]!.rowSpan).toBe(2)
  })

  it('keeps a heading and a code block that are inside a cell', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [
            element('tableCell', [
              element('heading', [text('Findings')], { level: '3' }),
              element('codeBlock', [text('whoami\nnet user')]),
            ]),
          ]),
        ]),
      ])
    })
    expect((nodes[0] as TableNode).rows[0]![0]!.text).toBe('Findings whoami net user')
  })

  it('keeps the words of a table too wide to be a grid, and builds no grid', () => {
    // 1000 cells each a legal colspan=64 is 64,000 columns; past MAX_COLUMNS the
    // words are kept by the unknown-block rule and no grid is built.
    const nodes = resolve((fragment) => {
      const cells = Array.from({ length: 1000 }, () => cell('tableCell', 'x', { colspan: '64' }))
      fragment.insert(0, [element('table', [element('tableRow', cells)])])
    })
    expect(nodes.every((node) => node.type !== 'table')).toBe(true)
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('keeps the words of a table with more rows than a page could hold', () => {
    const nodes = resolve((fragment) => {
      const rows = Array.from({ length: 1000 }, () => element('tableRow', [cell('tableCell', 'r')]))
      fragment.insert(0, [element('table', rows)])
    })
    expect(nodes.every((node) => node.type !== 'table')).toBe(true)
  })

  it('drops a table with no cells rather than drawing an empty grid', () => {
    expect(resolve((fragment) => {
      fragment.insert(0, [element('table', [element('tableRow', [])])])
    })).toEqual([])
  })

  it('places a cell that spans two columns and two rows across its rectangle', () => {
    // The 2x2 rectangle is the value in the top-left and blanks over the rest,
    // and the spans ride the top-left cell so Word merges the whole block.
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [cell('tableCell', 'A', { colspan: '2', rowspan: '2' }), cell('tableCell', 'B')]),
          element('tableRow', [cell('tableCell', 'C')]),
          element('tableRow', [cell('tableCell', 'D'), cell('tableCell', 'E'), cell('tableCell', 'F')]),
        ]),
      ])
    })
    const table = nodes[0] as TableNode
    expect(table.rows.map((row) => row.map((one) => one.text))).toEqual([
      ['A', '', 'B'],
      ['', '', 'C'],
      ['D', 'E', 'F'],
    ])
    expect(table.rows[0]![0]!.colSpan).toBe(2)
    expect(table.rows[0]![0]!.rowSpan).toBe(2)
  })

  it('pads a colspan cell out to a row that is wider below it', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [cell('tableCell', 'A', { colspan: '3' })]),
          element('tableRow', [cell('tableCell', 'B'), cell('tableCell', 'C'), cell('tableCell', 'D'), cell('tableCell', 'E')]),
        ]),
      ])
    })
    const table = nodes[0] as TableNode
    expect(table.widths).toHaveLength(4)
    expect(table.rows[0]!.map((one) => one.text)).toEqual(['A', '', '', ''])
    expect(table.rows[0]![0]!.colSpan).toBe(3)
  })

  /**
   * **A merged header cell keeps its words and loses its merge - a known
   * limit.**
   */
  it('keeps a merged header cell as a label and a blank, losing only the merge', () => {
    const nodes = resolve((fragment) => {
      fragment.insert(0, [
        element('table', [
          element('tableRow', [cell('tableHeader', 'Merged head', { colspan: '2' })]),
          element('tableRow', [cell('tableCell', 'x'), cell('tableCell', 'y')]),
        ]),
      ])
    })
    const table = nodes[0] as TableNode
    expect(table.header).toEqual(['Merged head', ''])
    expect(table.rows.map((row) => row.map((one) => one.text))).toEqual([['x', 'y']])
  })
})
