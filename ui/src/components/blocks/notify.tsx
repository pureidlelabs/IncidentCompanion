import { ApiError } from '@/api/client'

import { ToastQueue, type ToastMessage, type ToastTone } from '@/components/ui/toast'
import { WriteFailure } from './write-failure'

/**
 * What a toast *says*, in this app's terms. The toast itself is the kit's:
 * `toast.tsx` draws it, `App.tsx` mounts `ToastRegion` against `toastQueue`
 * below. Named `notify` rather than `toast` since this file draws no
 * component. What is here is the call-site shape every screen uses, and the
 * two functions that turn a refused write into a sentence an analyst can act
 * on.
 */

/**
 * The one queue, and the only reason a module can raise a toast without a
 * hook: React Aria holds toast state outside React, so this is a module
 * singleton `App.tsx`'s `ToastRegion` subscribes to. Three visible at once; a
 * fourth reaches the height of a dialog.
 */
export const toastQueue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 3 })

/**
 * How long a toast that is not a failure stays: React Aria's own floor for a
 * dismissible notification. The timer pauses while the region is hovered or
 * focused.
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
 * Spelled out rather than collapsed: a warning is a row somebody else
 * changed and an error is a write that did not land, and drawn the same
 * colour an analyst reads the first as the second.
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
 *
 * The server sends two different 409s and they need different sentences:
 * `refuseIfHeldByAnother` answers one for a row somebody has *open*, and the
 * version check answers one for a row somebody has *written*. `heldBy` is
 * what distinguishes them -- telling the analyst their colleague saved first
 * when nobody saved anything sends them looking for a change that is not
 * there.
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
 * Report a bulk PATCH's stale ids. Silent when nothing is missing, like
 * every write: the optimistic rows are the confirmation. A missing id is one
 * whose row another session has since deleted.
 */
export function reportBulkMissing(missing: readonly string[], what: string): void {
  if (missing.length === 0) return
  const count = missing.length
  toast.warning(`${String(count)} ${what} ${count === 1 ? 'was' : 'were'} no longer there.`)
}

/**
 * Report a bulk PATCH's refused ids: rows another analyst changed while this
 * selection was held, which the version check turned away.
 *
 * **Separate from `reportBulkMissing`, because the two send an analyst to
 * different places.** A missing row is gone and there is nothing to look at. A
 * refused one is still on screen, holding somebody else's change, and is worth
 * rereading before the patch is tried again.
 */
export function reportBulkRefused(refused: readonly string[], what: string): void {
  if (refused.length === 0) return
  const count = refused.length
  const [subject, verb] = count === 1 ? ['it', 'was'] : ['them', 'were']
  toast.warning(`${String(count)} ${what} changed since you read ${subject} and ${verb} not updated.`)
}

/**
 * Say what an imported archive brought, and what it named but did not carry.
 *
 * **The attachment count is the half nothing else can tell the analyst.** An
 * archive exported without its files imports cleanly and its rows go on
 * naming evidence that is not in it, so the import is the only moment that
 * knows. A warning rather than an error: a handover export omits every
 * attachment deliberately.
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
