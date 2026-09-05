/**
 * The severity ramp as classes, and the words that resolve onto it.
 */

/**
 * Fill and ink per severity, for a chip.
 */
export const TONE_CLASS = {
  critical: 'bg-severity-critical text-on-severity',
  high: 'bg-severity-high text-on-severity',
  medium: 'bg-severity-medium text-on-severity',
  // Its own ink: `low` is the one level light enough that white text fails on
  // it - measured 1.8:1 against the shared foreground, 10.4:1 against this one.
  low: 'bg-severity-low text-on-severity-low',
  info: 'bg-severity-info text-on-severity',
  none: 'bg-severity-none text-on-severity',
} as const

export type SeverityTone = keyof typeof TONE_CLASS

/**
 * Severity to tone, where the two names differ.
 */
const TONE_OF: ReadonlyMap<string, SeverityTone> = new Map([['informational', 'info']])

/**
 * The tone a severity word resolves to.
 */
export function toneFor(severity: string | null | undefined): SeverityTone {
  const key = (severity ?? '').trim().toLowerCase()
  return TONE_OF.get(key) ?? (Object.hasOwn(TONE_CLASS, key) ? (key as SeverityTone) : 'none')
}

/**
 * The severity ramp, plus the one tone a *lifecycle* needs and the ramp cannot
 * give it.
 */
export type FieldTone = SeverityTone | 'done'

/**
 * `GET /api/specs`' `field_tones` words onto the severity ramp this file
 * already measures contrast for.
 */
export const FIELD_TONE_SEVERITY: Record<string, FieldTone> = {
  bad: 'critical',
  warn: 'medium',
  good: 'low',
  info: 'info',
  done: 'done',
}

/**
 * The level's colour as **type**, and as a **fill**. Timeline's marker maps,
 * moved here from `TimelineRow` so the entity tables paint from them too.
 */
export const TONE_INK: Record<FieldTone, string> = {
  critical: 'text-severity-critical-type',
  high: 'text-severity-high',
  medium: 'text-severity-medium',
  low: 'text-severity-low-type',
  info: 'text-severity-info',
  none: 'text-severity-none',
  done: 'text-action-contain',
}

export const TONE_FILL: Record<FieldTone, string> = {
  critical: 'bg-severity-critical-type',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low-type',
  info: 'bg-severity-info',
  none: 'bg-severity-none',
  done: 'bg-action-contain',
}
