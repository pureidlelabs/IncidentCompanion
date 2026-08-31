import { Upload } from 'lucide-react'
import { useState } from 'react'

import { ApiError } from '@/api/client'
import { useCollections } from '@/api/collections'
import type { BatchCreatableCollectionName } from '@/api/model'
import type { FormSpec } from '@/api/specs'
import { useEntryBulkCreate } from '@/api/useEntryBulkCreate'
import { ImportCsvDialog } from '@/components/blocks/import-csv-dialog'
import { Button } from '@/components/ui/button'
import { parseRowError, previewIndexForServerRow } from '@/components/blocks/csv-import'
import { toast } from '@/components/blocks/notify'

export interface ImportCsvControlProps<
  N extends BatchCreatableCollectionName,
  TData extends { id: string },
> {
  collection: N
  form: FormSpec<TData>
  entries: readonly TData[]
  /**
   * The case being written to.
   *
   * Taken as a prop rather than read from the route: a block that calls
   * `useCaseId` cannot render anywhere but under `/cases/:caseId`, which is
   * the gallery included.
   */
  caseId: string
}

/**
 * A table toolbar's CSV import: the button, the dialog, and the one bulk-create
 * call the pair makes.
 *
 * - Gated on `GET /api/collections`' `batch_create`, never a hardcoded list.
 * - Renders nothing while that fetch is pending, and nothing where the
 *   collection refuses batch writes.
 * - A row-scoped server refusal is mapped back to the preview row that caused
 *   it; anything else shows as its own message.
 * - Every other piece of the import is pure and takes its rows as props, so
 *   this is the only file holding the mutation.
 */
export function ImportCsvControl<N extends BatchCreatableCollectionName, TData extends { id: string }>({
  collection,
  form,
  entries,
  caseId,
}: ImportCsvControlProps<N, TData>) {
  const collections = useCollections()
  const bulkCreate = useEntryBulkCreate(caseId, collection)
  const [open, setOpen] = useState(false)
  const [errorRow, setErrorRow] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const batchCreate = collections.data?.[collection]?.batchCreate
  if (!batchCreate) return null

  const clearErrors = () => {
    setErrorRow(null)
    setErrorMessage(null)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onPress={() => {
          clearErrors()
          setOpen(true)
        }}
      >
        <Upload />
        Import CSV
      </Button>
      <ImportCsvDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) clearErrors()
        }}
        collection={collection}
        form={form}
        existing={entries}
        importing={bulkCreate.isPending}
        errorRow={errorRow}
        errorMessage={errorMessage}
        onSubmit={(rows, refs) => {
          clearErrors()
          bulkCreate.mutate(rows, {
            onSuccess: (result) => {
              setOpen(false)
              toast.success(`${String(result.ids.length)} row(s) imported.`)
            },
            onError: (error) => {
              const parsed = error instanceof ApiError ? parseRowError(error.message) : null
              if (parsed) {
                setErrorRow(previewIndexForServerRow(parsed.row, refs))
                setErrorMessage(parsed.detail)
              } else {
                setErrorMessage(error.message)
              }
            },
          })
        }}
      />
    </>
  )
}
