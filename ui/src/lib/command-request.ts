import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/** The search key a command travels on when its control is on another screen. */
export const COMMAND_PARAM = 'do'

/** `/cases/x/timeline?do=new-entry` -- the section, carrying what to do there. */
export function commandPath(base: string, section: string, id: string): string {
  return `${base}/${section}?${COMMAND_PARAM}=${encodeURIComponent(id)}`
}

/**
 * Runs a command this screen owns the control for, once, on arrival.
 *
 * A command names the section whose toolbar offers it, and that screen is not
 * mounted when the command fires from somewhere else -- so it travels on the
 * URL instead of through a handler nothing has registered yet. The parameter
 * is cleared as it runs: a reload or a back would otherwise fire it again.
 */
export function useCommandRequest(handlers: Readonly<Record<string, () => void>>): void {
  const [params, setParams] = useSearchParams()
  const asked = params.get(COMMAND_PARAM)
  // The handlers close over this render's state and are a new object each
  // time; the ask is what fires the effect, so the latest pair is written from
  // an effect and read from one, never during a render.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    if (asked === null) return
    const handler = latest.current[asked]
    if (handler === undefined) return
    handler()
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete(COMMAND_PARAM)
        return next
      },
      { replace: true },
    )
  }, [asked, setParams])
}
