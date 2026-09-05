import { Languages } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  actionsColumn,
  DataTable,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { coveragePercent, LANGUAGE_KEY_COUNT, type LanguageRow } from './picker-rows'
import { Section } from './section'

/** What a report may be written in. */
export function LanguagesPane({ languages }: { languages: readonly LanguageRow[] }) {
  const [held, setHeld] = useState(languages)
  const [given, setGiven] = useState(languages)
  if (given !== languages) {
    setGiven(languages)
    setHeld(languages)
  }
  const rows = useMemo(() => [...held], [held])
  const columns = useMemo(
    () =>
      languageColumns((id) => {
        setHeld((current) => current.filter((one) => one.id !== id))
      }),
    [],
  )
  const table = useEntityTable<LanguageRow>({
    data: rows,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  return (
    <Section
      title="Report languages"
      blurb="What a report may be written in."
      actions={
        // A pack is a file the server stores and reads back; there is no route
        // here to put one anywhere.
        <Button
          variant="outline"
          size="sm"
          isDisabled
          aria-label={'Upload a pack \u2014 stored by the server'}
        >
          Upload a pack
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <DataTable
          table={table}
          label="Report languages"
          scroll="page"
          empty={
            <EmptyState
              icon={Languages}
              title="No language packs"
              detail="Upload one, and every report can be written in it."
            />
          }
        />
        <p className="text-micro text-ink-muted">
          A complete pack carries {LANGUAGE_KEY_COUNT} strings.
        </p>
      </div>
    </Section>
  )
}

/**
 * A language pack's columns.
 */
function languageColumns(onRemove: (id: string) => void): EntityColumn<LanguageRow>[] {
  return [
    {
      id: 'label',
      accessorFn: (one) => one.label,
      header: 'Language',
      meta: { className: 'font-medium' },
      cell: ({ row: one }) => (
        <span className="block truncate" title={one.original.label}>
          {one.original.label}
        </span>
      ),
    },
    {
      accessorKey: 'code',
      header: 'Code',
      meta: { className: 'w-28 font-mono text-micro' },
    },
    {
      accessorKey: 'coverage',
      header: 'Coverage',
      meta: { className: 'w-28 tabular-nums' },
      cell: ({ row: one }) => coveragePercent(one.original.coverage),
    },
    {
      accessorKey: 'builtin',
      header: 'Source',
      meta: { className: 'w-32' },
      cell: ({ row: one }) => (
        <Badge variant={one.original.builtin ? 'soft' : 'outlined'} size="xs" uppercase={false}>
          {one.original.builtin ? 'Built in' : 'Uploaded'}
        </Badge>
      ),
    },
    actionsColumn<LanguageRow>(
      (one) => one.label,
      (one) =>
        one.builtin
          ? []
          : [
              [
                {
                  id: 'remove',
                  label: 'Remove\u2026',
                  danger: true,
                  onSelect: () => {
                    onRemove(one.id)
                  },
                },
              ],
            ],
      // A built-in pack ships with the image: it can be read and never removed,
      // and the row says so by offering nothing rather than refusing.
      () => ({ edit: false, delete: false }),
    ),
  ]
}
