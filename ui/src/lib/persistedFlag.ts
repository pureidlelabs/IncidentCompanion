import { useCallback, useEffect, useState } from 'react'

/**
 * The rail's two folds, remembered in `localStorage` under the shell's
 * own keys.
 *
 * **The keys are inherited from the tier this replaced**, so an analyst's
 * collapsed rail survived the port. Renaming them now would silently reset
 * every existing install's preference, which is a worse trade than an
 * unfashionable key name.
 *
 * Nothing here is server state. Both were a POST in an earlier version
 * whose only job was to remember a class the browser had already applied.
 *
 * Reads lazily inside `useState` rather than in an effect: an effect paints
 * the expanded rail first and collapses it a frame later, which reads as the
 * rail flinching on every load. A `localStorage` throw (private mode, a
 * disabled store) falls back to the default rather than taking the shell down.
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

  useEffect(() => {
    try {
      window.localStorage.setItem(key, String(value))
    } catch {
      // A store that refuses a write still has to leave the rail usable.
    }
  }, [key, value])

  const toggle = useCallback(() => {
    setValue((current) => !current)
  }, [])

  return [value, toggle] as const
}

export const RAIL_COLLAPSED_KEY = 'ic-rail-collapsed'
export const REPORTS_FOLDED_KEY = 'ic-reports-folded'
