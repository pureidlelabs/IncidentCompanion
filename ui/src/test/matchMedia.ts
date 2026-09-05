/**
 * jsdom defines no `window.matchMedia`, so any test touching `system` theme
 * resolution has to install one. A `MediaQueryList` stub rather than the
 * bare boolean a `matches`-only mock would give: `GroundSwitcher` registers a
 * `change` listener to follow the OS live, and a mock with no listener
 * registry cannot simulate that firing.
 *
 * Only `(prefers-color-scheme: dark)` is modelled - the one query the app
 * asks. `mockMatchMedia(true)` installs it and returns a `fireChange` to
 * flip `matches` and dispatch to every registered listener, standing in for
 * the OS switching theme mid-session.
 */
import { vi } from 'vitest'

export function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: 'change', listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_event: 'change', listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    },
    /**
     * **The deprecated pair, because a real `MediaQueryList` still has it.**
     * Safari only gained `addEventListener` on this interface in 14, so
     * libraries that support older browsers call `addListener` and let it
     * throw nowhere - `next-themes` does. A stub carrying only the modern pair
     * is not a `MediaQueryList`, and the failure is a `TypeError` inside the
     * library rather than anything about the app.
     */
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    },
  }

  window.matchMedia = vi.fn().mockReturnValue(mediaQueryList) as typeof window.matchMedia

  return {
    fireChange(next: boolean) {
      matches = next
      const event = { matches } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    },
  }
}
