/**
 * An ISO stamp as "3 minutes ago", falling back to a date once that stops
 * meaning anything.
 */
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const ON_A_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * `now` is a parameter rather than a `Date.now()` call so a test can pin it -
 * the alternative is a test that mocks the clock globally, which every other
 * test in the file then inherits.
 */
export function whenAgo(iso: string, now: number = Date.now()): string {
  if (!iso) return ''
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return ''

  const behind = now - at
  // A stamp from the future is a clock disagreement, not a value to render as
  // "in 3 minutes" - the server's clock and the browser's are two clocks.
  if (behind < MINUTE) return 'just now'
  if (behind < HOUR) return RELATIVE.format(-Math.floor(behind / MINUTE), 'minute')
  if (behind < DAY) return RELATIVE.format(-Math.floor(behind / HOUR), 'hour')
  if (behind < WEEK) return RELATIVE.format(-Math.floor(behind / DAY), 'day')

  const then = new Date(at)
  return then.getFullYear() === new Date(now).getFullYear()
    ? ON_A_DAY.format(then)
    : WITH_YEAR.format(then)
}

/** The full stamp, for the `title` the relative text is short for. */
export function exactly(iso: string): string | undefined {
  if (!iso) return undefined
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? undefined : at.toLocaleString()
}
