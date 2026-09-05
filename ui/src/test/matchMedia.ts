/**
 * jsdom defines no `window.matchMedia`, so any test touching `system` theme
 * resolution has to install one.
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
