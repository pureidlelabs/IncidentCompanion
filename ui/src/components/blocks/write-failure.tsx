import { OctagonXIcon } from 'lucide-react'

import type { ApiError } from '@/api/client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

/**
 * What a refused write says, drawn as a card rather than a sentence.
 */
export function WriteFailure({
  what,
  error,
  onRetry,
  onDismiss,
}: {
  /** The collection, in the analyst's words: `Indicators`, `the section order`. */
  what: string
  error: ApiError
  /** Absent where the caller holds no way to run the write again. */
  onRetry?: (() => void) | undefined
  onDismiss: () => void
}) {
  const fields = error.fieldErrors.slice(0, SHOWN)
  const hidden = error.fieldErrors.length - fields.length
  const retryable = onRetry !== undefined && error.fieldErrors.length === 0

  return (
    /* **`minmax(0,1fr)`, because `Alert` lays out as a grid and `1fr` means
       `minmax(auto,1fr)`.** A refusal sentence can carry an unbreakable run -
       `expected one of "critical"|"high"|"medium"|"low"|"informational"` - and
       an auto minimum lets the column grow to it, which pushes the action row
       28px outside a card that still measures 356px. Caught by the story
       tier's own box assertion; jsdom reports every one of those numbers as 0. */
    <Alert
      variant="destructive"
      className="w-[356px] gap-3 [grid-template-columns:minmax(0,1fr)]"
    >
      <div className="flex items-start gap-3">
        <OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <AlertTitle>{what} was not saved.</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </div>
      </div>

      {fields.length > 0 && (
        <>
          <Separator className="opacity-40" />
          {/* **Mono on the field name, sans on the sentence.** `--text-data`
              names a face for text an analyst would copy, compare or grep - a
              schema field name is that, and the server's sentence about it is
              prose. `detail-grid.tsx` splits them the same way. */}
          <ul aria-label="Fields refused" className="flex flex-col gap-1">
            {fields.map((refused) => (
              <li key={refused.field} className="flex min-w-0 gap-2 text-[length:var(--text-data)]">
                <span className="shrink-0 font-mono opacity-80">{refused.field}</span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {refused.message}
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="text-[length:var(--text-data)] opacity-70">
              and {String(hidden)} more
            </p>
          )}
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button size="xs" variant="outline" onPress={onDismiss}>
          Dismiss
        </Button>
        {retryable && (
          <Button size="xs" onPress={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Alert>
  )
}

/**
 * How many refused fields the card draws before counting the rest.
 */
const SHOWN = 4
