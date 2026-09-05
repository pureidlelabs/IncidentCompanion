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
 *
 * `warning` rather than `destructive`: nothing failed and nothing is lost from
 * the case -- the other analyst's value is in the field, and this says whose
 * it is and where to look at it.
 *
 * `row` is what separates a table from a form. A surface with rows has to say
 * which one, because reopening the field means nothing until the analyst knows
 * which row's field; a form has one of each, so naming a row there would be a
 * name with nothing to match it against.
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
