import { useTheme } from 'next-themes'

import { THEME_OPTIONS, type Theme } from '@/lib/theme-preference'

/**
 * The chosen ground, from `next-themes`.
 */
export function useGround(): { theme: Theme; setTheme: (next: Theme) => void } {
  const { theme, setTheme } = useTheme()

  return {
    /**
     * **Validated against the list, not cast to it.**
     */
    theme: THEME_OPTIONS.some((option) => option.value === theme)
      ? (theme as Theme)
      : 'system',
    setTheme,
  }
}
