import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Cell,
  Column,
  ResizableTableContainer,
  Row,
  Table,
  TableBody,
  TableHeader,
  tableCellVariants,
  tableContainerVariants,
} from './table'

/**
 * The corner a bordered container hands the cells on its edge.
 */
function bordered() {
  return render(
    <ResizableTableContainer>
      <Table aria-label="Widgets">
        <TableHeader>
          <Column id="name" isRowHeader>
            Name
          </Column>
          <Column id="zone">Zone</Column>
        </TableHeader>
        <TableBody>
          <Row id="w0">
            <Cell>widget 0</Cell>
            <Cell>north</Cell>
          </Row>
        </TableBody>
      </Table>
    </ResizableTableContainer>,
  )
}

describe('the corner a table container declares', () => {
  it('names the radius inside its own border when it draws one', () => {
    const chrome = tableContainerVariants()

    expect(chrome).toContain('rounded-lg')
    expect(chrome).toContain('[--table-corner:calc(var(--radius-lg)-1px)]')
  })

  it('names no corner when it draws none', () => {
    const chrome = tableContainerVariants({ variant: 'plain' })

    expect(chrome).toContain('[--table-corner:0px]')
    expect(chrome).not.toContain('rounded-lg')
  })
})

describe('what reads that corner', () => {
  /**
   * The head is square and the table clips to the curve, which is the pair
   * that has to hold together: an opaque band rounding its own corners inside
   * a box already clipping to the same radius leaves a transparent notch at
   * each end, and body rows are positioned, so they paint through it.
   */
  it('clips the table to it, and leaves the head square', () => {
    const { container } = bordered()

    expect(container.querySelector('table')?.className).toContain(
      '[clip-path:inset(0_round_var(--table-corner))]',
    )

    const head = container.querySelector('th')
    expect(head?.className).not.toContain('rounded-tl-(--table-corner)')
    expect(head?.className).not.toContain('rounded-tr-(--table-corner)')
  })

  /**
   * The ring is drawn by a box *inside* the head cell, so the cell's own radius
   * does nothing for it.
   */
  it('passes the corner down to the box that draws the head ring', () => {
    const { container } = bordered()

    const head = container.querySelector('th')
    const ring = head?.querySelector('[role="presentation"]') ?? null
    expect(ring).not.toBeNull()

    for (let box = ring; box !== null && box !== head; box = box.parentElement) {
      expect(box.className).toContain('rounded-[inherit]')
    }
  })

  it('rounds the outer cells of the last row to it', () => {
    const chrome = tableCellVariants()

    expect(chrome).toContain('group-last/row:first:rounded-bl-(--table-corner)')
    expect(chrome).toContain('group-last/row:last:rounded-br-(--table-corner)')
  })
})
