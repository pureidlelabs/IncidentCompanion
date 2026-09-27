import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Cell, Column, Row, Table, TableBody, TableHeader } from './table'

/**
 * The selection column is a column, so a reader asks what it is.
 *
 * It holds a select-all checkbox for `multiple` and nothing at all for
 * `single`, and in neither case did anything name the column. -> #930
 */
const draw = (selectionMode: 'single' | 'multiple') =>
  render(
    <Table aria-label="Affected hosts" selectionMode={selectionMode}>
      <TableHeader>
        <Column id="host" isRowHeader>
          Host
        </Column>
      </TableHeader>
      <TableBody>
        <Row id="one">
          <Cell>WS-112</Cell>
        </Row>
      </TableBody>
    </Table>,
  )

describe('a table names its selection column', () => {
  it.each(['single', 'multiple'] as const)('names it in %s selection', (mode) => {
    draw(mode)
    const named = screen
      .getAllByRole('columnheader')
      .map((header) => header.getAttribute('aria-label') ?? header.textContent.trim())
    expect(named, 'a column header reaches a reader with nothing to announce').not.toContain('')
  })
})
