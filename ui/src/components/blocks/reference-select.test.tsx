import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ReferenceMultiSelect } from '@/components/blocks/reference-select'

/**
 * The create row, under a query.
 */
const OPTIONS = new Map([
  ['s1', 'WKS-FIN01'],
  ['s2', 'FS-02'],
])

/** The rows the list is offering, after typing `query` into the field. */
async function rowsAfterTyping(query: string): Promise<string[]> {
  // Typing is what opens it: the kit's `openOnInputClick` is false by default
  // and this block does not turn it on, so a click alone offers nothing.
  await userEvent.type(screen.getByRole('combobox', { name: 'Systems' }), query)
  // The list portals to `document.body`, so it is found on `screen` and not
  // within any container the block rendered.
  return within(screen.getByRole('listbox'))
    .queryAllByRole('option')
    .map((option) => option.textContent)
}

describe('the create row under a query', () => {
  it('survives a query that matches a case row', async () => {
    render(
      <ReferenceMultiSelect
        label="Systems"
        options={OPTIONS}
        target="systems"
        value={[]}
        onChange={vi.fn()}
        onCreateNew={vi.fn()}
        createLabel="Add a new system"
      />,
    )

    const rows = await rowsAfterTyping('FS')

    expect(rows.some((row) => row.includes('FS-02')), rows.join(' | ')).toBe(true)
    expect(
      rows.some((row) => row.includes('Add a new system')),
      `the create row went missing under a query: ${rows.join(' | ')}`,
    ).toBe(true)
  })

  it('offers the create row when the query matches nothing at all', async () => {
    render(
      <ReferenceMultiSelect
        label="Systems"
        options={OPTIONS}
        target="systems"
        value={[]}
        onChange={vi.fn()}
        onCreateNew={vi.fn()}
        createLabel="Add a new system"
      />,
    )

    const rows = await rowsAfterTyping('zzzz')

    expect(
      rows.some((row) => row.includes('Add a new system')),
      `nothing matched and the create row was gone too: ${rows.join(' | ')}`,
    ).toBe(true)
  })
})
