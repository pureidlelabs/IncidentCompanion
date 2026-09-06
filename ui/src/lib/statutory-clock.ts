/**
 * The statutory clock, computed on the client - and only the part of it that
 * is arithmetic rather than legal interpretation.
 *
 * `NOTIFY_AUTHORITY_HOURS`, `deadline` and `hoursRemaining` carry the GDPR
 * notification window, which is stated in `openspec/specs/compliance/spec.md`.
 * The clock face
 * and the day number are defined here and nowhere else - which is what puts
 * this module in `lib/` rather than under either tier: a second copy that
 * read an offsetless stamp as local time where this one reads it as UTC would
 * give the gallery and the app deadlines hours apart, and only on a machine
 * away from UTC.
 *
 * **Why duplicating this one is legitimate and duplicating the rest is not.**
 * `hours_remaining` is `gdpr_aware_at + 72h - now`, and the 72 is written into
 * Article 33(1) itself. Nothing here decides whether the notification is
 * *owed* - that is `article_33`, which runs the ENISA score, the policy floors
 * and the scope gate. The rule: a row the UI layer invented would be a
 * compliance policy written in the UI layer. So the clock reads; the
 * obligation does not. -> `components/blocks/case-queue.ts`
 *
 * **Minutes are rounded once, then carried into the hours.** Rounding the hour
 * and the minute independently renders 1.999 h as `+1:60`; a wrong clock face
 * is what the analyst reads to the regulator.
 */

/** Article 33(1). `gdpr_lens.NOTIFY_AUTHORITY_HOURS`. */
export const NOTIFY_AUTHORITY_HOURS = 72

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/**
 * An ISO stamp as a `Date`, or `null` when it is absent or unparseable.
 *
 * `gdpr_lens.deadline` returns None on a bad timestamp rather than raising,
 * because the field arrives from a CSV import and the API as well as from a
 * form. A section that will not render is a worse answer than a deadline it
 * cannot compute, and that holds identically here.
 *
 * A stamp with no offset is read as UTC, matching the `tzinfo is None ->
 * replace(tzinfo=utc)` branch in both Python functions. `Date` would otherwise
 * read a bare `2026-07-24T21:35:41` as *local* time, which silently moves the
 * deadline by the viewer's offset.
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
 *
 * Signed rather than clamped at zero - overdue and due-right-now call for
 * different conversations with the regulator.
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
 *
 * Hours and minutes rather than "3 days late": the deadline is an hour count
 * in the article, and rounding to days loses the only figure the analyst
 * reports to the regulator.
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
 *
 * From `detected_at` where there is one and `opened_at` otherwise - a case
 * opened three days after the detection it describes is on day 4, not day 1.
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
