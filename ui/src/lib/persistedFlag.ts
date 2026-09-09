import { useCallback, useState } from 'react'

/**
 * The rail's two folds, remembered in `localStorage` under the shell's
 * own keys.
 *
 * Nothing here is server state: a POST whose only job is to remember a class
 * the browser has already applied buys nothing.
 *
 * Reads lazily inside `useState` rather than in an effect: an effect paints
 * the expanded rail first and collapses it a frame later, which reads as the
 * rail flinching on every load. A `localStorage` throw (private mode, a
 * disabled store) falls back to the default rather than taking the shell down.
 *
 * **Written on a press and never on the first render.** The fallback is what
 * the viewport chose, and a store that wrote it would hand a phone the desktop
 * visit's open rail; only the analyst's own press is theirs to be remembered.
 */
export function usePersistedFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? fallback : stored === 'true'
    } catch {
      return fallback
    }
  })

  const toggle = useCallback(() => {
    setValue((current) => {
      const next = !current
      try {
        window.localStorage.setItem(key, String(next))
      } catch {
        // A store that refuses a write still has to leave the rail usable.
      }
      return next
    })
  }, [key])

  return [value, toggle] as const
}
