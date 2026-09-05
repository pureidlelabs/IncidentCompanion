/**
 * Clock, day and duration text for a case, in UTC and hand-formatted.
 */

/** Epoch milliseconds, or `null` where the value is not a stamp. */
export function msOf(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null
  const at = Date.parse(iso)
  return Number.isNaN(at) ? null : at
}

/** `HH:MM`, UTC. What a gutter carries, because the day is a heading above it. */
export function clockOf(iso: string): string {
  const at = msOf(iso)
  if (at === null) return iso
  const when = new Date(at)
  return `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}`
}

/**
 * The day this stamp belongs to, as an opaque key: it is compared, never read.
 */
export function dayKeyOf(iso: string): string {
  const at = msOf(iso)
  if (at === null) return iso
  return new Date(at).toISOString().slice(0, 10)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** `24 July 2026`, UTC. */
export function dayLabelOf(iso: string): string {
  const at = msOf(iso)
  if (at === null) return iso
  const when = new Date(at)
  return `${String(when.getUTCDate())} ${MONTHS[when.getUTCMonth()] ?? ''} ${String(when.getUTCFullYear())}`
}

/**
 * `Sat 25 Jul`. The cascade's day rule, which is a divider between stretches
 * rather than a heading and has a lane's width to sit in.
 */
export function dayShortOf(iso: string): string {
  const at = msOf(iso)
  if (at === null) return iso
  const when = new Date(at)
  const weekday = WEEKDAYS_SHORT[when.getUTCDay()] ?? ''
  const month = MONTHS_SHORT[when.getUTCMonth()] ?? ''
  return `${weekday} ${String(when.getUTCDate())} ${month}`
}

/** `18 July 2026 06:31`, UTC. What a written note is stamped with. */
export function stampOf(iso: string): string {
  const at = msOf(iso)
  if (at === null) return iso
  return `${dayLabelOf(iso)} ${clockOf(iso)}`
}

/** Epoch seconds to the ISO string the formatters above take. */
export function isoOfEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

/**
 * A span in the coarsest two units that still say something: `45m`,
 * `20h 30m`, `2d 4h`. Never a bare count of minutes at day scale.
 */
export function durationText(ms: number): string {
  const total = Math.floor(ms / 60_000)
  if (total < 1) return 'under a minute'
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total - days * 1440) / 60)
  const minutes = total - days * 1440 - hours * 60
  if (days > 0) return hours > 0 ? `${String(days)}d ${String(hours)}h` : `${String(days)}d`
  if (hours > 0) return minutes > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(hours)}h`
  return `${String(minutes)}m`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
