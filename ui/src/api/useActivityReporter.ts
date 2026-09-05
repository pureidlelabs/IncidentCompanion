import { useEffect } from 'react'

import { reportActivity } from '@/api/client'

/**
 * Keep the server's idle clock advancing while the analyst is working.
 */
const REPORT_EVERY_MS = 60_000

/** What counts as somebody being there. Passive: none of them is cancelled,
 *  and a non-passive listener on `wheel` blocks scrolling. */
const INPUT_EVENTS = ['keydown', 'pointerdown', 'wheel'] as const

export function useActivityReporter(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let reported = 0
    const seen = () => {
      const now = Date.now()
      if (now - reported < REPORT_EVERY_MS) return
      reported = now
      void reportActivity()
    }
    for (const name of INPUT_EVENTS) window.addEventListener(name, seen, { passive: true })
    return () => {
      for (const name of INPUT_EVENTS) window.removeEventListener(name, seen)
    }
  }, [enabled])
}
