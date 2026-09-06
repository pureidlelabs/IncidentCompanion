/**
 * What the app calls a ground, and what it offers.
 *
 * **The storage, the `matchMedia` listener and the `system` resolution all
 * went to `next-themes`.** This file held them, `index.html` held a second
 * inline copy of the read half so the first frame was not painted light, and a
 * comment asked whoever changed one to check the other. The provider does the
 * lot from one place, including its own blocking script, so what is left here
 * is the vocabulary: the closed type the switchers are written against, and
 * the labelled list they draw.
 *
 * The legacy `ic-dev-theme` seed went with it. It read a key the switcher
 * wrote to before promotion, and nothing is installed anywhere for it to
 * migrate.
 */

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

export type Theme = 'light' | 'dark' | 'system'

/** The key `next-themes` persists under, and `public/theme.js` reads. */
export const THEME_KEY = 'ic-theme'

/**
 * How the app configures `next-themes`, in one object rather than at each
 * mount.
 *
 * **Because a copy of a configuration is not the configuration.** The test
 * written to hold this - "the provider writes `data-theme` and not a class" -
 * rendered a `ThemeProvider` it constructed itself with the same four props,
 * and so did `CaseShell.test.tsx`. Both passed with `main.tsx` set to
 * `attribute="class"` and a `storageKey` that no longer matched
 * `public/theme.js`: three tiers green with the ground switcher inert and the
 * first-paint contract broken. Exported here so every mount and every test
 * spreads the same object and a change reaches all of them.
 *
 * `attribute` is what the whole stylesheet keys on. `storageKey` is half of a
 * contract with `public/theme.js`, which reads it before the bundle runs -
 * `THEME_KEY` is the other half, and they are the same constant now rather
 * than two strings that agreed.
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
 *
 * Three further languages shipped and were dropped 2026-08-01: four grounds is
 * four sets of colour roles to keep in step for a product whose paint is not
 * settled, and every token added had to be declared four times before any test
 * would pass. They are one `git revert` away when the look is fixed.
 */
export type Language = 'console'

/**
 * The rows every ground menu maps over, in the order they are drawn.
 *
 * **The only list, and the others are derived from it below.** A menu
 * carrying its own literal shows a fourth ground in one place and not the
 * others, with nothing red.
 *
 * The glyph lives here rather than at the call sites for the same reason: it
 * is per ground, and a `Record<Theme, Icon>` written out by hand is a second
 * list that compiles.
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
