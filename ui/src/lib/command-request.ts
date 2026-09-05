import { useEffect, useRef } from 'react'

/** The search key a command travels on when its control is on another screen. */
export const COMMAND_PARAM = 'do'

/** `/cases/x/timeline?do=new-entry` -- the section, carrying what to do there. */
export function commandPath(base: string, section: string, id: string): string {
  return `${base}/${section}?${COMMAND_PARAM}=${encodeURIComponent(id)}`
}

/**
 * Runs a command this screen owns the control for, once, on arrival.
 */
export function useCommandRequest(handlers: Readonly<Record<string, () => void>>): void {
  // The handlers close over this render's state and are a new object each
  // time, so the latest pair is written from an effect and read from one.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const asked = params.get(COMMAND_PARAM)
    if (asked === null) return
    // **`Object.hasOwn`, never a bare index.** `asked` is whatever the URL
    // carries, and `constructor` and `toString` sit on every object's
    // prototype -- so `?do=constructor` indexes to a function, passes an
    // `undefined` check and gets called. `canonicalSlug` refuses a slug the
    // same way and for the same reason.
    if (!Object.hasOwn(latest.current, asked)) return
    const handler = latest.current[asked]
    if (typeof handler !== 'function') return

    // Cleared first: a reload or a back would otherwise fire it again, and
    // clearing after the handler leaves the parameter up while a dialog opens.
    params.delete(COMMAND_PARAM)
    const rest = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${rest === '' ? '' : `?${rest}`}${window.location.hash}`,
    )
    handler()
  })
}
