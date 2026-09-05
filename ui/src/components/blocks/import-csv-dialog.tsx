import { CircleAlert, Upload } from 'lucide-react'
import { useState } from 'react'

import type { CollectionName } from '@/api/model'
import { fieldOf, shortLabel, type FormSpec } from '@/api/specs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  adviceFor,
  buildPreview,
  buildSubmission,
  hasDedupKey,
  type ImportPreview,
  type RowResult,
} from '@/components/blocks/csv-import'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { DropZone, FileTrigger } from '@/components/ui/drop-zone'
import {
  Cell,
  Column,
  ResizableTableContainer,
  Row,
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { parseCsvTable } from '@/lib/csv'

/** One preview column: its key, its heading, and the form field it carries. */
interface PreviewColumn {
  id: string
  label: string
  field: string | null
}

export interface ImportCsvDialogProps<TData extends { id: string }> {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection: CollectionName
  form: FormSpec<TData>
  existing: readonly TData[]
  importing: boolean
  /** The preview row a `row N` refusal named, if the last submit failed that way. */
  errorRow: number | null
  /** Any other refusal - a cap breach, a network failure, an unrecognised 422. */
  errorMessage: string | null
  onSubmit: (rows: Record<string, unknown>[], refs: number[]) => void
}

/**
 * Pick a CSV, read what it parses to, skip the rows that are wrong, submit once.
 */
export function ImportCsvDialog<TData extends { id: string }>({
  open,
  onOpenChange,
  collection,
  form,
  existing,
  importing,
  errorRow,
  errorMessage,
  onSubmit,
}: ImportCsvDialogProps<TData>) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parseProblem, setParseProblem] = useState<string | null>(null)

  const reset = () => {
    setFileName(null)
    setPreview(null)
    setParseProblem(null)
  }

  /** Takes a `FileList` from the trigger or an array from a drop; both give one file. */
  async function pickFile(files: FileList | readonly File[] | null) {
    const file = files?.[0]
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    let table: ReturnType<typeof parseCsvTable>
    try {
      table = parseCsvTable(text)
    } catch {
      setPreview(null)
      setParseProblem('The file could not be read as CSV.')
      return
    }
    if (!table) {
      setPreview(null)
      setParseProblem('The file is empty.')
      return
    }
    setParseProblem(null)
    setPreview(buildPreview(table, form, collection, existing))
  }

  function toggleSkip(rowIndex: number) {
    setPreview((current) => {
      if (!current) return current
      return {
        ...current,
        rows: current.rows.map((row, index) =>
          index === rowIndex ? { ...row, skip: !row.skip } : row,
        ),
      }
    })
  }

  const mappedColumns = preview?.columns.filter((column) => column.field !== null) ?? []
  const showSkip = hasDedupKey(collection)
  const includedCount = preview?.rows.filter((row) => !row.skip).length ?? 0
  const hasBlockingProblem =
    preview?.rows.some((row) => !row.skip && row.problems.length > 0) ?? false
  const canSubmit = preview !== null && includedCount > 0 && !hasBlockingProblem && !importing

  // One list drives the header and every row, so the two cannot fall out of
  // step - React Aria matches cells to columns by position.
  const columns: PreviewColumn[] = [
    { id: 'csv-row', label: 'Row', field: null },
    ...mappedColumns.map((column) => ({
      id: `field:${column.header}`,
      label:
        column.field === null
          ? column.header
          : shortLabel(fieldOf(form, column.field)?.label ?? column.header),
      field: column.field,
    })),
    { id: 'status', label: 'Status', field: null },
    ...(showSkip ? [{ id: 'skip', label: 'Skip', field: null }] : []),
  ]

  function cellOf(column: PreviewColumn, row: RowResult, index: number) {
    if (column.id === 'csv-row') return row.csvRow
    if (column.id === 'status') {
      if (row.problems.length > 0) {
        return <span className="text-destructive">{row.problems.join('; ')}</span>
      }
      return (
        <span className="text-ink-muted">
          {row.duplicate ? 'Probable duplicate' : 'OK'}
        </span>
      )
    }
    if (column.id === 'skip') {
      return (
        <Checkbox
          aria-label={`Skip row ${String(row.csvRow)}`}
          isSelected={row.skip}
          onChange={() => {
            toggleSkip(index)
          }}
        />
      )
    }
    return column.field === null ? '' : (row.values[column.field] ?? '')
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const advice = errorMessage === null ? null : adviceFor(errorMessage)

  return (
    <Dialog
      isOpen={open}
      size="workbench"
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      dialogProps={{ 'aria-label': 'Import CSV' }}
    >
      <DialogHeader
        title="Import CSV"
        description="Every row is checked before anything is written. If one row is refused, none are."
        onClose={close}
      />
      <DialogBody>
        <div className="flex flex-col gap-3">
          {/* The zone and the trigger take the same file: a drop is faster
              from a file manager, and the button is the only route from the
              keyboard. `getDropOperation` refuses a non-CSV before it lands,
              rather than after parsing it. */}
          <DropZone
            label={fileName ?? 'Drop a CSV here'}
            description={fileName === null ? 'One row per entry, a column per field.' : undefined}
            getDropOperation={(types) =>
              types.has('text/csv') || types.has('.csv') ? 'copy' : 'cancel'
            }
            onDrop={(event) => {
              const dropped = event.items.find((item) => item.kind === 'file')
              if (dropped?.kind !== 'file') return
              void dropped.getFile().then((file) => pickFile([file]))
            }}
          >
            <FileTrigger
              acceptedFileTypes={['.csv', 'text/csv']}
              onSelect={(files) => {
                void pickFile(files)
              }}
            >
              <Button variant="outline" className="w-fit">
                <Upload />
                {fileName === null ? 'Choose a file' : 'Choose another'}
              </Button>
            </FileTrigger>
          </DropZone>

          {parseProblem !== null && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <CircleAlert className="size-4" />
              {parseProblem}
            </p>
          )}

          {errorMessage !== null && (
            <div role="alert">
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <CircleAlert className="size-4" />
                {errorMessage}
              </p>
              {/* Inside the same alert, so a screen reader reads the refusal
                  and what to do about it as one announcement. */}
              {advice !== null && (
                <p className="mt-1 pl-5.5 text-sm text-ink-muted">{advice}</p>
              )}
            </div>
          )}

          {preview !== null && (
            <>
              {preview.unmappedHeaders.length > 0 && (
                <p className="text-xs text-ink-muted">
                  Not recognised, excluded: {preview.unmappedHeaders.join(', ')}
                </p>
              )}
              <p className="text-xs text-ink-muted">
                {String(includedCount)} of {String(preview.rows.length)} row(s) will be imported.
              </p>

              <ResizableTableContainer className="max-h-96">
                <Table aria-label="Rows read from the file" className="text-xs">
                  <TableHeader>
                    {columns.map((column) => (
                      <Column key={column.id} id={column.id} isRowHeader={column.id === 'csv-row'}>
                        {column.label}
                      </Column>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, index) => (
                      <Row
                        key={row.csvRow}
                        id={row.csvRow}
                        className={cn(
                          errorRow === index && 'bg-destructive/10',
                          // **75, not 50.** The status cell is already
                          // `text-ink-muted`, and dimming compounds: at half
                          // opacity that reads 2.11:1, and *Probable duplicate*
                          // is the sentence an analyst is deciding against.
                          // Three quarters keeps the row visibly set aside and
                          // its reason legible.
                          row.skip && 'opacity-75',
                        )}
                      >
                        {columns.map((column) => (
                          <Cell
                            key={column.id}
                            className={cn(
                              column.id === 'csv-row' && 'text-ink-muted',
                              column.id.startsWith('field:') && 'max-w-40 truncate',
                            )}
                          >
                            {cellOf(column, row, index)}
                          </Cell>
                        ))}
                      </Row>
                    ))}
                  </TableBody>
                </Table>
              </ResizableTableContainer>
            </>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onPress={close}>
          Cancel
        </Button>
        <Button
          variant="default"
          isDisabled={!canSubmit}
          onPress={() => {
            if (!preview) return
            const { rows, refs } = buildSubmission(preview, form)
            onSubmit(rows, refs)
          }}
        >
          {importing ? 'Importing\u2026' : `Import ${String(includedCount)} row(s)`}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
