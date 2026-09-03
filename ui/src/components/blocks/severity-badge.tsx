import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import {
  FIELD_TONE_SEVERITY,
  TONE_CLASS,
  TONE_FILL,
  TONE_INK,
  toneFor,
  type FieldTone,
  type SeverityTone,
} from '@/components/blocks/severity-tones'
import {
  ROLE_INK,
  ROLE_PAINT,
  held,
  paintFor,
  type FieldToneSpec,
} from '@/components/blocks/field-tones'

export {
  FIELD_TONE_SEVERITY,
  ROLE_INK,
  ROLE_PAINT,
  TONE_CLASS,
  TONE_FILL,
  TONE_INK,
  held,
  paintFor,
  toneFor,
}
export type { FieldTone, FieldToneSpec, SeverityTone }

/**
 * A severity as a chip.
 *
 * The tone tables and `toneFor` come from `blocks/severity-tones`, so a
 * severity resolves the same way wherever it is drawn.
 *
 * - `variant="solid"` because `TONE_CLASS` supplies the fill.
 * - A severity outside the known set renders as `none`, not unstyled.
 * - An empty severity renders the word `unset`.
 */
export function SeverityBadge({
  severity,
  className,
}: {
  /** Free text on the wire; anything unrecognised falls to the `none` tone. */
  severity: string
  className?: string
}) {
  return (
    <Badge variant="solid" className={cn(TONE_CLASS[toneFor(severity)], className)}>
      {severity.trim() || 'unset'}
    </Badge>
  )
}

/**
 * A field value as a classification chip: hue for how bad, fill for whether
 * anything is wrong here.
 *
 * **It classifies nothing itself.** The tone arrives resolved
 * (`specs.fieldTones[field]?.[value]`), so `compromised` is not parsed as a
 * severity word and a value the server maps later needs no change here.
 *
 * - Filled means adverse. Hollow means nothing is wrong, or it is explained.
 * - A tone this build cannot paint, and one that never arrived, are both the
 *   grey hollow chip -- never an unpainted `Badge`.
 * - An empty value is the caller's em dash to draw.
 */
export function FieldToneBadge({
  value,
  tone,
  label,
  className,
}: {
  value: string
  /** The served tone, or `undefined` when the field has none. */
  tone: FieldToneSpec | undefined
  /**
   * What a reader hears instead of the painted word.
   *
   * **For a column whose other state is spelled rather than painted.** The
   * paint carries the field's name to the eye and to nobody else, so a cell
   * reading `isolated` beside one reading `Isolated: no` announces the two
   * states of one column in two grammars -- and the painted one, which is the
   * state worth hearing, is the one missing the field.
   */
  label?: string | undefined
  className?: string
}) {
  const { role, fill, className: paint } = paintFor(tone)
  return (
    <Badge
      variant={fill === 'solid' ? 'solid' : 'outlined'}
      size="sm"
      data-slot="field-tone"
      data-tone={role}
      data-fill={fill}
      {...(label === undefined ? {} : { 'aria-label': label })}
      className={cn('min-w-0', paint, className)}
    >
      <span className="truncate">{value}</span>
    </Badge>
  )
}
