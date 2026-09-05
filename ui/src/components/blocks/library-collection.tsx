import { LibraryBig, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { matchesWords } from '@/lib/word-match'
import { Button } from '@/components/ui/button'
import { FieldGroup, GroupInput } from '@/components/ui/field'

import { actionsColumn, DataTable, useEntityTable, type EntityColumn } from './data-table'
import { EmptyState } from './empty-state'
import { CountBadge } from './section-head'
import { Section } from './section'
import { FieldToneBadge } from './severity-badge'

/** An entry in one of a install's drop-in libraries. */
export interface LibraryRow {
  id: string
  /** What an analyst calls it. */
  label: string
  /** The key the file is registered under. */
  name: string
  origin: 'yours' | 'built-in'
}

/** From twelve entries up a library draws its own search box. */
const SEARCHABLE_FROM = 12

/**
 * One drop-in library: its rows, and the way to add to one.
 *
 * The three picker libraries - case templates, report layouts, snippets -
 * differ in their words and in whether the server lets anything be added, so
 * this is one component taking both as data rather than three copies of the
 * same table with the strings changed.
 *
 * **Duplicate and the bin act on this component's own list; the pencil and
 * the add door do not appear.** A copy and a removal are decisions about
 * which entries the library holds, which this component holds. Editing one
 * opens the library editor and adding one writes a file, neither of which
 * this tier draws - and a pencil that opens nothing is worse than a row
 * without one.
 */
export function LibraryCollection({
  title,
  blurb,
  noun,
  group,
  entries,
  newLabel,
}: {
  title: string
  blurb: string
  /** The server's word for one entry, used in the search and the empty state. */
  noun: string
  /** A heading over the table, where the library holds more than one group. */
  group?: string
  entries: readonly LibraryRow[]
  /** The label the server offers for adding one. Absent means the library is closed. */
  newLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [held, setHeld] = useState(entries)
  const [given, setGiven] = useState(entries)
  if (given !== entries) {
    setGiven(entries)
    setHeld(entries)
  }
  const typed = query.trim()

  const rows = useMemo(
    () => held.filter((one) => matchesWords(`${one.label} ${one.name}`, query)),
    [held, query],
  )

  /** A built-in copied into this library: the copy is yours and is editable. */
  const duplicate = (id: string) => {
    setHeld((current) => {
      const one = current.find((entry) => entry.id === id)
      if (!one) return current
      return [
        ...current,
        {
          ...one,
          id: `${one.id}-copy`,
          name: `${one.name}-copy`,
          label: `${one.label} (copy)`,
          origin: 'yours' as const,
        },
      ]
    })
  }

  const columns = useMemo(() => libraryColumns(duplicate), [])
  const table = useEntityTable<LibraryRow>({
    data: rows,
    columns,
    meta: {
      pendingIds: new Set(),
      commit: () => undefined,
      remove: (id) => {
        setHeld((current) => current.filter((one) => one.id !== id))
      },
    },
  })

  return (
    <Section
      title={title}
      blurb={blurb}
      meta={
        <CountBadge shown={typed === '' ? entries.length : rows.length} total={entries.length} noun={noun} />
      }
    >
      <div className="flex flex-col gap-3">
        {group !== undefined && (
          <h2 className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{group}</h2>
        )}

        {entries.length >= SEARCHABLE_FROM && (
          <FieldGroup size="sm" className="max-w-sm gap-1 px-1.5">
            <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <GroupInput
              value={query}
              placeholder={`Search ${noun}s...`}
              aria-label={`Search ${noun}s`}
              className="px-1 text-sm"
              onChange={(event) => {
                setQuery(event.target.value)
              }}
            />
          </FieldGroup>
        )}

        {entries.length === 0 ? (
          <EmptyState icon={LibraryBig} title={`No ${noun}s available`} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={LibraryBig}
            title="Nothing matches"
            detail={`No ${noun} in this library matches "${typed}".`}
            action={
              <Button
                variant="outline"
                onPress={() => {
                  setQuery('')
                }}
              >
                Show every {noun}
              </Button>
            }
          />
        ) : (
          <DataTable table={table} label={group ?? `${noun}s`} scroll="page" />
        )}

        {newLabel !== undefined && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            isDisabled
            aria-label={`${newLabel} \u2014 written in the library editor`}
          >
            <Plus aria-hidden />
            {newLabel}
          </Button>
        )}
      </div>
    </Section>
  )
}

/**
 * A library entry's columns.
 *
 * **Key rather than File**: an entry is registered under a key, and the file
 * it came from is not what anything else in the app names it by.
 */
function libraryColumns(onDuplicate: (id: string) => void): EntityColumn<LibraryRow>[] {
  return [
    {
      id: 'label',
      accessorFn: (one) => one.label,
      header: 'Name',
      meta: { className: 'font-medium' },
      cell: ({ row: one }) => (
        <span className="block truncate" title={one.original.label}>
          {one.original.label}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Key',
      meta: { className: 'w-64 font-mono text-data text-ink-muted' },
      cell: ({ row: one }) => (
        <span className="block truncate" title={one.original.name}>
          {one.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'origin',
      header: 'Source',
      meta: { className: 'w-32' },
      cell: ({ row: one }) => <FieldToneBadge value={one.original.origin} tone={undefined} />,
    },
    actionsColumn<LibraryRow>(
      (one) => one.label,
      (one) =>
        one.origin === 'built-in'
          ? [
              [
                {
                  id: 'duplicate',
                  label: 'Duplicate',
                  onSelect: () => {
                    onDuplicate(one.id)
                  },
                },
              ],
            ]
          : [],
      // A built-in entry is served from the image, so it can be copied and
      // never removed. The row states that by having no bin rather than by
      // refusing one that is drawn.
      (one) => ({ delete: one.origin === 'yours' }),
    ),
  ]
}
