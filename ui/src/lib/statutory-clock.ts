/**
 * The statutory clock, computed on the client - and only the part of it that
 * is arithmetic rather than legal interpretation.
 */

/** Article 33(1). `gdpr_lens.NOTIFY_AUTHORITY_HOURS`. */
export const NOTIFY_AUTHORITY_HOURS = 72

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/**
 * An ISO stamp as a `Date`, or `null` when it is absent or unparseable.
 */
export function parseStamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const stamp = new Date(utc)
  return Number.isNaN(stamp.getTime()) ? null : stamp
}

/** `gdpr_lens.deadline`: when the Article 33 notification is due. */
export function deadline(awareAt: string | null | undefined): Date | null {
  const aware = parseStamp(awareAt)
  if (aware === null) return null
  return new Date(aware.getTime() + NOTIFY_AUTHORITY_HOURS * MS_PER_HOUR)
}

/**
 * `gdpr_lens.hours_remaining`: hours left, negative once the deadline passed.
 */
export function hoursRemaining(
  awareAt: string | null | undefined,
  now: Date,
): number | null {
  const due = deadline(awareAt)
  if (due === null) return null
  return (due.getTime() - now.getTime()) / MS_PER_HOUR
}

/**
 * Signed hours and minutes - `-72:00`, `+11:30` - or an em dash for no reading.
 */
export function clockFace(hours: number | null): string {
  if (hours === null) return '\u2014'
  const sign = hours < 0 ? '-' : '+'
  const minutes = Math.round(Math.abs(hours) * 60)
  const mm = String(minutes % 60).padStart(2, '0')
  return `${sign}${String(Math.floor(minutes / 60))}:${mm}`
}

/**
 * Which day of the case this is, first day = 1.
 */
export function dayNumber(
  detectedAt: string | null | undefined,
  openedAt: string | null | undefined,
  now: Date,
): number {
  const start = parseStamp(detectedAt) ?? parseStamp(openedAt)
  if (start === null) return 1
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY) + 1)
}
