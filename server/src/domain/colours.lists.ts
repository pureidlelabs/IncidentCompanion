/**
 * The colours an analyst may put on a timeline entry.
 */

/** One entry per hue family, in the order the band draws them. */
const BASE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // amber
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
] as const

/** The lighter step of each family, for the dark ground. */
const LIGHT = [
  '#f87171',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
] as const

/** The darker step of each family, for white paper. */
const DARK = [
  '#b91c1c',
  '#c2410c',
  '#a16207',
  '#15803d',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
] as const

export const ENTRY_COLOUR = [...BASE, ...LIGHT, ...DARK] as const

/**
 * The colour a severity gives an entry when the analyst has set none.
 */
export const SEVERITY_COLOUR: Readonly<Record<string, string>> = {
  critical: '#b91c1c',
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
  informational: '#3b82f6',
}

/**
 * The colour an activity's type gives it.
 */
export const ACTION_TYPE_COLOUR: Readonly<Record<string, string>> = {
  'external notification sent': '#3b82f6',
  'external notification received': '#3b82f6',
  'internal notification': '#3b82f6',
  escalation: '#3b82f6',
  'containment action': '#22c55e',
  'remediation action': '#22c55e',
  'investigation started': '#8b5cf6',
  'ticket created': '#8b5cf6',
  'evidence collected': '#8b5cf6',
  other: '#8b5cf6',
}
