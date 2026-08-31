import { useEffect } from 'react'

import { reportActivity } from '@/api/client'

/**
 * Keep the server's idle clock advancing while the analyst is working.
 *
 * The session's expiry *is* the idle window (`IDLE_WINDOW_SECONDS`), and it
 * only moves when something reads the session - `reportActivity`. Without this,
 * an analyst typing into a controlled input makes no request and is signed out
 * mid-sentence.
 *
 * **Real input, not presence, and no timer may call this.** Keys and pointers
 * only, never `visibilitychange`: a tab returning to the front is the machine
 * being unlocked rather than the analyst having been there, so counting it
 * would reset the clock at exactly the moment it should fire. A heartbeat turns
 * the timeout into a no-op for any tab left open, which is the state it exists
 * to catch.
 *
 * The throttle below makes a moving pointer one message a minute rather than
 * one a frame. It is a local constant because the server publishes no window,
 * and drift costs at most one extra report a minute.
 *
 * **There is no client-side sign-out timer**, so an abandoned tab sits looking
 * signed in until it is touched. The enforcement half - the gate refusing a
 * stale session - is unaffected.
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
