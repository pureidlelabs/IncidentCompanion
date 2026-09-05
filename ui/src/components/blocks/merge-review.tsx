import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export interface MergeReviewProps {
  /** The field the write was refused on, in the words the control carries. */
  field: string
  /** Who wrote first. */
  by: string
  /** The row it was written to, where the surface has rows. */
  row?: string | undefined
  /** Passed through to the band, for the gap a caller's layout owes it. */
  className?: string | undefined
}

/**
 * The band a screen draws when another analyst's write got in first.
 */
export function MergeReview({ field, by, row, className }: MergeReviewProps) {
  return (
    <Alert variant="warning" {...(className === undefined ? {} : { className })}>
      <AlertTitle>{field} was not saved</AlertTitle>
      <AlertDescription>
        {row === undefined
          ? `${by} set it first. Reopen the field to see what it holds now.`
          : `${by} set it on ${row} first. Reopen the row to see what it holds now.`}
      </AlertDescription>
    </Alert>
  )
}
