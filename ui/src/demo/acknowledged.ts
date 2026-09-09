/**
 * Whether this browser has read what the demo is.
 *
 * One flag, written only when the visitor presses the button, holding no
 * identifier and reaching no server: a preference the visitor set, kept on
 * the same footing as the case in IndexedDB and the theme choice. A browser
 * that refuses storage asks again on the next visit, which is the right
 * failure.
 */
const KEY = 'incidentcompanion.demo.acknowledged'

export function wasAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function acknowledge(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    /* asked again next time */
  }
}
