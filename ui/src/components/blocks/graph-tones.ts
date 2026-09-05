import type { Specs } from '@/api/specs'

/**
 * A node's colour, from the tones the server publishes.
 */

export type Tone = 'bad' | 'warn' | 'good' | 'info' | 'none'

/**
 * A served severity to the tone the canvas paints it in.
 */
export const SEVERITY_TONE: Record<string, Tone> = {
  critical: 'bad',
  high: 'bad',
  medium: 'warn',
  low: 'good',
  informational: 'info',
  info: 'info',
}

/**
 * Tone -> CSS custom property.
 */
const TOKEN: Record<Tone, string> = {
  bad: 'var(--severity-critical)',
  warn: 'var(--severity-medium)',
  good: 'var(--severity-low)',
  info: 'var(--severity-info)',
  none: 'var(--severity-none)',
}

/**
 * The served colour role onto the canvas's four tones.
 */
const ROLE_TONE: Record<string, Tone> = {
  critical: 'bad',
  high: 'bad',
  investigate: 'bad',
  medium: 'warn',
  low: 'warn',
  contain: 'good',
  info: 'info',
  none: 'none',
}

/** The tone the server assigns `value` on `field`, or `none`. */
export function toneOf(specs: Specs, field: string, value: string): Tone {
  if (!field || !value) return 'none'
  const served = specs.fieldTones[field]?.[value.trim().toLowerCase()]
  return (served && ROLE_TONE[served.tone]) ?? 'none'
}

export function toneColour(tone: Tone): string {
  return TOKEN[tone]
}

/** Convenience for a graph node: its `dangerField` and `danger`, resolved. */
export function nodeColour(
  specs: Specs,
  node: { danger: string; dangerField: string },
): string {
  return toneColour(toneOf(specs, node.dangerField, node.danger))
}
