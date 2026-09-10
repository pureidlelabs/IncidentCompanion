import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { ProseChannel, SyncStatus } from '@/api/proseSync'

/**
 * Why a document stopped taking what is typed into it.
 *
 * **One per document, not one per body.** A report is one channel behind every
 * section, so a notice drawn beside each body is a banner per section and an
 * announcement per section at once. The screen that owns the document draws
 * this once; `prose-body.tsx` owns the read-only half, which is per body.
 *
 * **The reason decides the sentence.** `read-only` is the analyst's reach on
 * the case and is the only answer a case note can give -- a screen assuming a
 * filed report tells a note's writer something that never happened.
 */
export function ProseRefusal({
  channel,
  status,
}: {
  channel: ProseChannel | null
  status: SyncStatus | undefined
}) {
  if (status !== 'refused' || channel === null) return null
  const filed = channel.refusedBecause === 'report-sent'
  return (
    /**
     * `status` rather than `alert`: this stands from the first paint when the
     * analyst navigates back into a document already refused, and an assertive
     * announcement is for something that has just changed.
     */
    <Alert variant="warning" role="status" className="mb-3">
      <AlertTitle>
        {filed ? 'This report was filed while you were writing' : 'You cannot write to this case'}
      </AlertTitle>
      <AlertDescription>
        {filed ? (
          <>
            {whenFiled(channel.refusedAt)}Nothing written here since then was saved. Copy anything
            you still need, then correct the report to write again.
          </>
        ) : (
          <>
            Your access to this case is read-only. Nothing typed here is saved -- copy anything you
            still need, and ask for write access if you should have it.
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * The moment, as a sentence, or nothing.
 *
 * *Filed while you were writing* is only answerable against a time the analyst
 * can place. An unparseable stamp says nothing rather than *Invalid Date*.
 */
function whenFiled(at: string | null): string {
  if (at === null) return ''
  const when = new Date(at)
  return Number.isNaN(when.getTime()) ? '' : `It was filed at ${when.toLocaleString()}. `
}
