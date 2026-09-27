import { useState } from 'react'

import { ApiError } from '@/api/client'
import { isThenable } from '@/lib/isThenable'
import { referencesHolding, refusedRows } from '@/api/useBulkDelete'
import { AlertDialog } from '@/components/ui/alert-dialog'

export interface ConfirmDeleteDialogProps {
  /** The rows to delete, as the caller holds them; only the count is read. `null` closes the dialog. */
  rows: readonly unknown[] | null
  onOpenChange: (open: boolean) => void
  /** May return a promise. A rejection keeps the dialog open and shows the reason. */
  onConfirm: () => unknown
  /** Given the row count, since the wording is the caller's. */
  title: (count: number) => string
  /** What confirming does. Replaced by the server's reason after a refusal. */
  consequence: string
  /** A row's name by id, so a refusal can say which rows moved. */
  named?: ((id: string) => string | undefined) | undefined
}


/**
 * Turns a refusal into one line.
 *
 * Two 409s reach here and they send the analyst to different places: rows
 * something else still names, and rows somebody has edited since this
 * selection was read. Each is counted where the body names them, because a
 * selection spanning tables cannot be corrected from a single number.
 */
function refusalMessage(error: unknown, named?: (id: string) => string | undefined): string {
  if (!(error instanceof ApiError)) return 'Could not delete.'
  const refused = refusedRows(error)
  const moved = refused.length
  if (moved > 0) {
    const names = refused.map((id) => named?.(id)).filter((name): name is string => Boolean(name))
    const which = names.length > 0 ? `: ${names.join(', ')}` : ''
    return moved === 1
      ? `1 of the selected rows changed since you read it${which}. Nothing was deleted.`
      : `${String(moved)} of the selected rows changed since you read them${which}. Nothing was deleted.`
  }
  const blocked = Object.keys(referencesHolding(error)).length
  if (blocked === 0) return error.message
  return blocked === 1
    ? '1 of the selected rows is still referenced elsewhere in the case.'
    : `${String(blocked)} of the selected rows are still referenced elsewhere in the case.`
}

/**
 * Delete confirmation for one or more rows.
 *
 * - Attempt-then-explain: the dialog stays open on a refusal and replaces
 *   `consequence` with the server's reason in the destructive colour.
 * - `onConfirm` may be synchronous, in which case the dialog closes at once.
 * - State resets whenever `rows` goes from `null` to a list.
 */
export function ConfirmDeleteDialog({
  rows,
  onOpenChange,
  onConfirm,
  title,
  consequence,
  named,
}: ConfirmDeleteDialogProps) {
  const about = rows ?? []
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tracked, setTracked] = useState(rows)

  if (rows !== tracked) {
    setTracked(rows)
    if (rows !== null) {
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
      setError(refusalMessage(thrown, named))
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
        setError(refusalMessage(thrown, named))
      }
      return
    }
    onOpenChange(false)
  }

  return (
    <AlertDialog
      isOpen={rows !== null}
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
