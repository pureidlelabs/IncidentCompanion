import type { RowDraft } from '@/api/rowDraft'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export interface MergeReviewProps {
  /** The field another analyst changed, in the words the control carries. */
  field: string
  /** Who changed it. */
  by: string
  /** The value they stored. */
  theirs: unknown
  /** Store the analyst's own value over theirs. */
  onKeep: () => void
  /** Drop the analyst's value and take theirs. */
  onTake: () => void
  /** Passed through to the band, for the gap a caller's layout owes it. */
  className?: string | undefined
}

/** A stored value as the band quotes it. */
function quoted(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'nothing'
  if (Array.isArray(value)) return value.length === 0 ? 'nothing' : value.map(String).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : JSON.stringify(value)
}

/**
 * The band beside a field another analyst changed while this analyst was
 * changing it.
 *
 * The analyst's value stays in the field; this quotes the other one and asks
 * which stands. Nothing is written until one of the two is pressed.
 */
export function MergeReview({ field, by, theirs, onKeep, onTake, className }: MergeReviewProps) {
  const title = `${by} changed ${field}`
  return (
    <div
      role="group"
      aria-label={title}
      data-part="merge-review"
      {...(className === undefined ? {} : { className })}
    >
      <Alert variant="warning">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{`Theirs: ${quoted(theirs)}. Yours is still in the field.`}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onPress={onKeep}>
            Keep mine
          </Button>
          <Button size="sm" variant="ghost" onPress={onTake}>
            Take theirs
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}

/** The band for one field of a draft, drawn only while another analyst's value is in dispute there. */
export function FieldConflict({
  draft,
  field,
  label,
  by,
  className,
}: {
  draft: RowDraft
  field: string
  label: string
  /** Who wrote the record at a version. */
  by: (version: number) => string
  className?: string | undefined
}) {
  const theirs = draft.holds[field]?.theirs
  if (!theirs) return null
  return (
    <MergeReview
      field={label}
      by={by(theirs.version)}
      theirs={theirs.value}
      onKeep={() => {
        draft.keepMine(field)
      }}
      onTake={() => {
        draft.takeTheirs(field)
      }}
      className={className}
    />
  )
}
