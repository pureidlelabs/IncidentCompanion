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
 *
 * The container scrolls, so it clips -- and it is rounded, so what it clips
 * against is a curve. A square box flush against that curve loses the corner
 * of whatever it paints, its focus ring included, and no padding on the
 * scrollport reaches it: every ring in this file is drawn at a negative
 * offset, inside the cell rather than outside it.
 *
 * jsdom lays nothing out and resolves no radius, so what this holds is the
 * pairing rather than the geometry: the container declares the measure and
 * every box on the edge reads it. Take either half away and the other goes
 * inert with nothing failing. The geometry is the visual tier's.
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
  it('rounds the outer head cells to it', () => {
    const { container } = bordered()

    const head = container.querySelector('th')
    expect(head?.className).toContain('first:rounded-tl-(--table-corner)')
    expect(head?.className).toContain('last:rounded-tr-(--table-corner)')
  })

  /**
   * The ring is drawn by a box *inside* the head cell, so the cell's own
   * radius does nothing for it. Every box between the two has to pass the
   * corner down, and one that does not is a square ring in a round hole
   * again -- the state this file was written against.
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
