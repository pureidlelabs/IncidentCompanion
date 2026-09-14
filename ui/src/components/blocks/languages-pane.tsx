import { Languages } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  actionsColumn,
  DataTable,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import { EmptyState } from '@/components/blocks/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileTrigger } from '@/components/ui/drop-zone'

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
  /**
   * **The row stays until the list is read again.** Filtering it out here told
   * an analyst a pack was gone while the install still held it, and the next
   * fetch brought it back -- the write's own invalidation is what removes it.
   * -> #664
   */
  const rows = useMemo(() => [...languages], [languages])
  /**
   * The pack the analyst has asked to remove, until they confirm it.
   *
   * **Asked before it goes, like every other destructive row action here.**
   * Removing a pack is an install-wide write that no route can undo -- there
   * is no export -- and the menu item's own ellipsis promises a further step.
   * -> #664
   */
  const [removing, setRemoving] = useState<string | null>(null)
  const columns = useMemo(
    () => languageColumns(onRemove ? (id) => setRemoving(id) : undefined),
    [onRemove],
  )
  const doomed = rows.find((one) => one.id === removing)
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
        <p className="text-micro text-ink-muted">A complete pack carries {keyCount} strings.</p>
      </div>

      {onRemove && (
        <ConfirmDeleteDialog
          ids={removing === null ? null : [removing]}
          onOpenChange={(isOpen) => {
            if (!isOpen) setRemoving(null)
          }}
          // Returned, so a refusal keeps the dialog open and says why rather
          // than closing over a removal that did not happen.
          onConfirm={() => (removing === null ? undefined : onRemove(removing))}
          title={() => `Remove ${doomed?.label ?? 'this pack'}?`}
          consequence="A document already exported in it is unaffected. Exporting one again, and every new report, falls back to English until a pack is uploaded again."
        />
      )}
    </Section>
  )
}

/**
 * The control that takes a pack off the analyst machine.
 *
 * Disabled only where nothing is listening, which is the gallery. -> #664
 */
function UploadPack({ onUpload }: { onUpload?: (file: File) => void }) {
  return (
    <FileTrigger
      acceptedFileTypes={['application/json', '.json']}
      onSelect={(files) => {
        const first = files?.item(0)
        if (first && onUpload) onUpload(first)
      }}
    >
      <Button variant="outline" size="sm" {...(onUpload ? {} : { isDisabled: true })}>
        Upload a pack
      </Button>
    </FileTrigger>
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
