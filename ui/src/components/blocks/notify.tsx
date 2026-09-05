import { ApiError } from '@/api/client'

import { ToastQueue, type ToastMessage, type ToastTone } from '@/components/ui/toast'
import { WriteFailure } from './write-failure'

/**
 * What a toast *says*, in this app's terms.
 */

/**
 * The one queue, and the only reason a module can raise a toast without a
 * hook: React Aria holds toast state outside React, so this is a module
 * singleton `App.tsx`'s `ToastRegion` subscribes to.
 */
export const toastQueue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 3 })

/**
 * How long a toast that is not a failure stays: React Aria's own floor for a
 * dismissible notification.
 */
const TIMEOUT = 5000

interface ToastOptions {
  description?: string
}

/** What a caller can offer beyond the sentence. */
export interface WriteFailureOptions {
  /**
   * Run the write again. Absent where the caller holds nothing to run -- a
   * delete whose row has gone is not retryable.
   */
  retry?: () => void
}

type Tone = 'plain' | 'error' | 'warning' | 'success'

/**
 * The app's four words for a toast, against the kit's four colour roles.
 */
const TONE: Record<Tone, ToastTone> = {
  plain: 'default',
  error: 'destructive',
  warning: 'warning',
  success: 'success',
}

function raise(tone: Tone, title: string, options?: ToastOptions): string {
  return toastQueue.add(
    {
      title,
      tone: TONE[tone],
      ...(options?.description === undefined ? {} : { description: options.description }),
    },
    // An error is never dismissed by time: the screen would otherwise show
    // the opposite of what happened once the timer clears it.
    tone === 'error' ? {} : { timeout: TIMEOUT },
  )
}

/** A callable with `.error` / `.warning` / `.success`, so call sites read `toast.error(...)`. */
export const toast = Object.assign(
  (title: string, options?: ToastOptions) => raise('plain', title, options),
  {
    error: (title: string, options?: ToastOptions) => raise('error', title, options),
    warning: (title: string, options?: ToastOptions) => raise('warning', title, options),
    success: (title: string, options?: ToastOptions) => raise('success', title, options),
  },
)

/**
 * Say what a refused write means, in the analyst's terms.
 */
export function reportWriteFailure(
  error: unknown,
  what: string,
  options?: WriteFailureOptions,
): void {
  if (error instanceof ApiError && error.writeConflict) {
    const holder = (error.body as { heldBy?: string } | null)?.heldBy
    // Neither is an error: one is a row somebody has open, the other a row
    // somebody has already changed. The screen is behind, not broken - and
    // neither names a refused field, so neither gets the card.
    toast.warning(
      holder ? `${holder} has ${what} open.` : `Another analyst saved ${what} first.`,
      { description: error.message },
    )
    return
  }

  // A thrown `TypeError` reaches here too, from a dropped connection, naming
  // no fields -- it still owes the analyst a way out.
  const refusal =
    error instanceof ApiError
      ? error
      : new ApiError(0, 'IncidentCompanion did not answer.', null)

  toastQueue.add({
    // Drawn by the card, not by the region -- but React Aria labels the toast
    // from it, so a card with no `title` announces as an unnamed dialog.
    title: `${what} was not saved.`,
    tone: 'destructive',
    render: (close) => (
      <WriteFailure
        what={what}
        error={refusal}
        onDismiss={close}
        {...(options?.retry === undefined
          ? {}
          : {
              onRetry: () => {
                close()
                options.retry?.()
              },
            })}
      />
    ),
  })
  // No timeout, as every refusal is -- `raise` is not the path here.
}

/**
 * Report a bulk PATCH's stale ids.
 */
export function reportBulkMissing(missing: readonly string[], what: string): void {
  if (missing.length === 0) return
  const count = missing.length
  toast.warning(`${String(count)} ${what} ${count === 1 ? 'was' : 'were'} no longer there.`)
}

/**
 * Report a bulk PATCH's refused ids: rows another analyst changed while this
 * selection was held, which the version check turned away.
 */
export function reportBulkRefused(refused: readonly string[], what: string): void {
  if (refused.length === 0) return
  const count = refused.length
  const [subject, verb] = count === 1 ? ['it', 'was'] : ['them', 'were']
  toast.warning(`${String(count)} ${what} changed since you read ${subject} and ${verb} not updated.`)
}

/**
 * Say what an imported archive brought, and what it named but did not carry.
 */
export function reportImportedCase(imported: { rows: number; missingFiles: number }): void {
  const title = `${String(imported.rows)} ${imported.rows === 1 ? 'row' : 'rows'} imported.`
  if (imported.missingFiles === 0) {
    toast.success(title)
    return
  }
  const count = imported.missingFiles
  const [noun, verb] = count === 1 ? ['attachment', 'is'] : ['attachments', 'are']
  toast.warning(title, {
    description: `${String(count)} ${noun} the rows name ${verb} not in the archive.`,
  })
}
