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
