import { Languages } from 'lucide-react'
import { useMemo, useRef } from 'react'

import {
  actionsColumn,
  DataTable,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { coveragePercent, type LanguageRow } from './picker-rows'
import { Section } from './section'

/** What a report may be written in. */
export function LanguagesPane({
  languages,
  keyCount,
  onRemove,
  onUpload,
}: {
  languages: readonly LanguageRow[]
  /** How many strings a complete pack carries, as the install serves it. */
  keyCount: number
  /** Removing one, by its code. Absent draws no bin. */
  onRemove?: (code: string) => void
  /** Taking a pack the analyst chose. Absent draws the control disabled. */
  onUpload?: (file: File) => void
}) {
  const rows = useMemo(() => [...languages], [languages])
  /**
   * **The row stays until the list is read again.** Filtering it out here told
   * an analyst a pack was gone while the install still held it, and the next
   * fetch brought it back -- the write's own invalidation is what removes it.
   * -> #664
   */
  const columns = useMemo(() => languageColumns(onRemove), [onRemove])
  const table = useEntityTable<LanguageRow>({
    data: rows,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  return (
    <Section
      title="Report languages"
      blurb="What a report may be written in."
      actions={<UploadPack {...(onUpload ? { onUpload } : {})} />}
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
          A complete pack carries {keyCount} strings.
        </p>
      </div>
    </Section>
  )
}

/**
 * The control that takes a pack off the analyst's machine.
 *
 * **A hidden file input behind the button**, because a file cannot be chosen
 * without one and a styled `<input type="file">` is the control this kit does
 * not have. The button is the accessible name; the input is what the browser
 * opens.
 *
 * Disabled only where nothing is listening, which is the gallery. -> #664
 */
function UploadPack({ onUpload }: { onUpload?: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        {...(onUpload ? {} : { isDisabled: true })}
        onPress={() => input.current?.click()}
      >
        Upload a pack
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared, so choosing the same file twice is two uploads rather
          // than one and then silence.
          event.target.value = ''
          if (file && onUpload) onUpload(file)
        }}
      />
    </>
  )
}

/**
 * A language pack's columns.
 *
 * **Coverage is floored** - 99.6% of the strings is not a complete pack, and
 * `100%` beside a report that falls back to English is the one number here that
 * would be read as a promise.
 */
function languageColumns(onRemove?: (id: string) => void): EntityColumn<LanguageRow>[] {
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
        one.builtin || !onRemove
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
