import { useCallback, useEffect, useState } from 'react'

/**
 * The rail's two folds, remembered in `localStorage` under the shell's
 * own keys.
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
