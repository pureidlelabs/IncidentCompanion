/**
 * An ISO stamp as "3 minutes ago", falling back to a date once that stops
 * meaning anything.
 *
 * **`Intl.RelativeTimeFormat`, not a hand-rolled ladder.** It is in every
 * browser this app runs in, it declines correctly ("1 minute" against
 * "2 minutes"), and it is the only version that stays right if the app is ever
 * read in a language other than English - which the report tier already is.
 *
 * **Past the week it gives the date instead.** "5 weeks ago" is a worse answer
 * than "28 Jun" for the question a case list is scanned for: relative time is
 * precise about the recent and vague about everything else, and a case that
 * has not moved in a month is being *found*, not resumed.
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
 *
 * An empty or unparseable stamp answers `''`, not "Invalid Date": a cell that
 * says nothing is the right answer to a stamp that means nothing, and it is
 * the caller's job to decide whether an absent stamp is worth a placeholder.
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
