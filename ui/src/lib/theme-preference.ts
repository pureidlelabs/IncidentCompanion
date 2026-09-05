/**
 * What the app calls a ground, and what it offers.
 */

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

export type Theme = 'light' | 'dark' | 'system'

/** The key `next-themes` persists under, and `public/theme.js` reads. */
export const THEME_KEY = 'ic-theme'

/**
 * How the app configures `next-themes`, in one object rather than at each
 * mount.
 */
export const THEME_PROVIDER = {
  attribute: 'data-theme',
  storageKey: THEME_KEY,
  defaultTheme: 'system',
  enableSystem: true,
  /**
   * The tokens swap in one frame; letting every transition in the tree animate
   * across that frame is the smear this exists for.
   */
  disableTransitionOnChange: true,
} as const

/**
 * One ground while the app is still forming.
 */
export type Language = 'console'

/**
 * The rows every ground menu maps over, in the order they are drawn.
 */
export const THEME_OPTIONS: readonly { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** The glyph a ground is drawn with, by value. Derived, never a second list. */
export const THEME_ICON: Record<Theme, LucideIcon> = Object.fromEntries(
  THEME_OPTIONS.map((option) => [option.value, option.icon]),
) as Record<Theme, LucideIcon>

/** Its label, likewise. */
export const THEME_LABEL: Record<Theme, string> = Object.fromEntries(
  THEME_OPTIONS.map((option) => [option.value, option.label]),
) as Record<Theme, string>
