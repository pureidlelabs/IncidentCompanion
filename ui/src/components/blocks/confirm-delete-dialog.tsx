import { useState } from 'react'

import { ApiError } from '@/api/client'
import { referencesHolding } from '@/api/useBulkDelete'
import { AlertDialog } from '@/components/ui/alert-dialog'

export interface ConfirmDeleteDialogProps {
  /** The rows to delete. `null` closes the dialog; `[]` opens it on nothing. */
  ids: string[] | null
  onOpenChange: (open: boolean) => void
  /** May return a promise. A rejection keeps the dialog open and shows the reason. */
  onConfirm: () => unknown
  /** Given the row count, since the wording is the caller's. */
  title: (count: number) => string
  /** What confirming does. Replaced by the server's reason after a refusal. */
  consequence: string
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
  )
}

/** Turns a refusal into one line. Counts the rows a reference check blocked, where it names them. */
function refusalMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not delete.'
  const blocked = Object.keys(referencesHolding(error)).length
  if (blocked === 0) return error.message
  return blocked === 1
    ? '1 of the selected rows is still referenced elsewhere in the case.'
    : `${String(blocked)} of the selected rows are still referenced elsewhere in the case.`
}

/**
 * Delete confirmation for one or more rows.
 */
export function ConfirmDeleteDialog({
  ids,
  onOpenChange,
  onConfirm,
  title,
  consequence,
}: ConfirmDeleteDialogProps) {
  const about = ids ?? []
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trackedIds, setTrackedIds] = useState(ids)

  if (ids !== trackedIds) {
    setTrackedIds(ids)
    if (ids !== null) {
      setError(null)
      setPending(false)
    }
  }

  async function handleConfirm() {
    setError(null)
    let result: unknown
    try {
      result = onConfirm()
    } catch (thrown) {
      setError(refusalMessage(thrown))
      return
    }
    if (isThenable(result)) {
      setPending(true)
      try {
        await result
        setPending(false)
        onOpenChange(false)
      } catch (thrown) {
        setPending(false)
        setError(refusalMessage(thrown))
      }
      return
    }
    onOpenChange(false)
  }

  return (
    <AlertDialog
      isOpen={ids !== null}
      onOpenChange={onOpenChange}
      tone="destructive"
      title={title(about.length)}
      consequence={
        error === null ? consequence : <span className="text-destructive">{error}</span>
      }
      confirmLabel="Delete"
      confirmPendingLabel={'Deleting\u2026'}
      isPending={pending}
      onConfirm={() => {
        void handleConfirm()
      }}
      onCancel={() => {
        onOpenChange(false)
      }}
    />
  )
}
