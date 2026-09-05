import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Collection } from './collection'
import { useEntityTable, type EntityColumn } from './entity-table'
import { useFilters } from './filter-set'

/**
 * `Collection` held at the four decisions it takes off the screens, because
 * each one is a decision four screens were making identically and one of them
 * could have got wrong on its own.
 */

interface Widget {
  id: string
  name: string
  kind: string
}

const widgets: Widget[] = [
  { id: 'w0', name: 'alpha', kind: 'red' },
  { id: 'w1', name: 'beta', kind: 'blue' },
]

const columns: EntityColumn<Widget>[] = [{ accessorKey: 'name', header: 'Name' }]

interface HarnessProps {
  /** What the search box opens with. */
  search?: string
  /** The way in an empty screen offers. */
  action?: boolean
  /** The warning above the table. */
  notice?: boolean
  /** Rows to draw. Empty exercises the empty state. */
  rows?: Widget[]
  read?: { isPending: boolean; isError: boolean }
}

function Harness({
  search = '',
  action = false,
  notice = false,
  rows = widgets,
  read,
}: HarnessProps) {
  const [query, setQuery] = useState(search)
  const filters = useFilters([
    {
      key: 'kind',
      label: 'Kind',
      options: [
        { value: 'red', count: 1 },
        { value: 'blue', count: 1 },
      ],
    },
  ])
  const kinds = filters.chosen('kind')
  const visible = rows.filter((row) => {
    if (query.trim() && !row.name.includes(query.trim())) return false
    if (kinds.length && !kinds.includes(row.kind)) return false
    return true
  })
  const table = useEntityTable<Widget>({
    data: visible,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  return (
    <div>
      <p data-testid="query">{query}</p>
      <p data-testid="kinds">{kinds.join(',')}</p>
      <Collection
        title="Widgets"
        meta="2 widgets"
        search={{
          column: 'Name',
          placeholder: "A widget's name",
          value: query,
          onValue: setQuery,
        }}
        filters={filters}
        table={{ table, label: 'Widgets' }}
        empty={{
          title: 'No widgets yet',
          detail: 'Widgets appear here as they are recorded.',
          ...(action ? { action: <button type="button">Add widget</button> } : {}),
        }}
        {...(notice ? { notice: { title: 'Nothing to push', detail: 'Set a disposition.' } } : {})}
        {...(read ? { read } : {})}
      />
    </div>
  )
}

describe('Collection', () => {
  /**
   * **A search box holding spaces is not a narrowing**, and every screen wrote
   * `Boolean(query.trim())` to say so.
   */
  it('reads a whitespace-only search as no search at all', () => {
    render(<Harness search="   " rows={[]} />)

    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(screen.getByText('No widgets yet')).toBeInTheDocument()
    expect(screen.queryByText('Nothing matches')).toBeNull()
  })

  /** Text in the box is a narrowing, and the empty state has to say so. */
  it('answers a search that matches nothing with the narrowed words', () => {
    render(<Harness search="zzz" />)

    expect(screen.getByText('Nothing matches')).toBeInTheDocument()
    expect(screen.getByText('Drop a filter or shorten the search.')).toBeInTheDocument()
    expect(screen.queryByText('No widgets yet')).toBeNull()
  })

  /**
   * **The offer to add a row is withheld while a filter is on.**
   */
  it('offers no way in while the table is narrowed', () => {
    // Unmounted rather than re-rendered: the harness seeds its search text
    // from a prop once, exactly as a screen does, so a second render is the
    // only way to open with the box filled.
    const { unmount } = render(<Harness action rows={[]} />)
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument()
    unmount()

    render(<Harness action rows={[]} search="zzz" />)
    expect(screen.queryByRole('button', { name: 'Add widget' })).toBeNull()
  })

  /**
   * **Clear drops both halves.**
   */
  it('clears the search text and the filters together', async () => {
    const user = userEvent.setup()
    render(<Harness search="alpha" />)

    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(await screen.findByRole('button', { name: /red/i }))
    expect(screen.getByTestId('kinds')).toHaveTextContent('red')

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.getByTestId('query')).toHaveTextContent('')
    expect(screen.getByTestId('kinds')).toHaveTextContent('')
  })

  /**
   * **A filter alone is a narrowing.**
   */
  it('counts a filter with no search text as narrowed', async () => {
    const user = userEvent.setup()
    render(<Harness rows={[{ id: 'w0', name: 'alpha', kind: 'red' }]} />)

    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(await screen.findByRole('button', { name: /blue/i }))
    await user.keyboard('{Escape}')

    expect(screen.getByText('Nothing matches')).toBeInTheDocument()
  })

  /** The warning is about the rows, so it opens the body rather than closing it. */
  it('draws the notice above the table', () => {
    render(<Harness notice />)

    const warning = screen.getByText('Nothing to push')
    const table = screen.getByRole('grid', { name: 'Widgets' })
    expect(warning.compareDocumentPosition(table)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('draws no empty state while the read is in flight', () => {
    render(<Harness rows={[]} read={{ isPending: true, isError: false }} />)

    expect(screen.queryByText('No widgets yet')).toBeNull()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  /** The head's own words, beside the title rather than instead of it. */
  it('puts the meta words beside the title', () => {
    render(<Harness />)

    const head = screen.getByRole('heading', { name: 'Widgets' }).parentElement
    expect(head).not.toBeNull()
    expect(within(head!).getByText('2 widgets')).toBeInTheDocument()
  })
})
