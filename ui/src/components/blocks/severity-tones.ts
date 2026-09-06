/**
 * The severity ramp as classes, and the words that resolve onto it.
 *
 * Holds no component and imports no kit, so a surface drawing a severity
 * reads this ramp rather than keeping its own.
 *
 * The colour is a token per severity and never a literal. A colour in the DOM
 * and the same colour in an SVG export are two decisions - an export has no
 * theme to consult, so nothing here is reused by one.
 */

/**
 * Fill and ink per severity, for a chip.
 *
 * An unknown severity renders as `none` rather than unstyled: severity is free
 * text on the wire and a value nobody anticipated must still read as a chip.
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
 *
 * The served vocabulary is `critical, high, medium, low, informational`; the
 * tones are named after their tokens. Only `informational` needs saying - the
 * rest carry the same name as their tone, and reading the tone name back is
 * what `toneFor` falls through to.
 *
 * A `Map` because `toneFor` takes whatever it is handed, and the `none` its
 * docstring promises is what a bare object gets past.
 */
const TONE_OF: ReadonlyMap<string, SeverityTone> = new Map([['informational', 'info']])

/**
 * The tone a severity word resolves to.
 *
 * **Takes the value defensively, though the type says `string`.** An
 * optimistic row is the fields the dialog sent and nothing else, so a timeline
 * entry can reach here mid-flight with no `severity` at all - and
 * `undefined.trim()` takes the whole SPA to React Router's error boundary
 * ("Unexpected Application Error!"), not just the row. The server refuses the
 * write correctly either way; the crash is the client rendering its own
 * optimistic guess.
 *
 * `none` is the documented answer for a value that is not a known tone, and a
 * missing value is one of those.
 */
export function toneFor(severity: string | null | undefined): SeverityTone {
  const key = (severity ?? '').trim().toLowerCase()
  return TONE_OF.get(key) ?? (Object.hasOwn(TONE_CLASS, key) ? (key as SeverityTone) : 'none')
}

/**
 * The severity ramp, plus the one tone a *lifecycle* needs and the ramp cannot
 * give it.
 *
 * **The ramp has no green, deliberately** - it runs red, orange, yellow, grey,
 * and `good` on it means *low severity*, which is the gold step. That is the
 * right answer for a verdict and the wrong one for "this document has been
 * sent": a finished state painted gold reads as a mild warning.
 *
 * `done` takes `--action-contain`, the same green a containment activity uses,
 * for the same reason activities are off the ramp at all: neither is a
 * detection, and borrowing a severity's colour files it under a severity's
 * language.
 */
export type FieldTone = SeverityTone | 'done'

/**
 * `GET /api/specs`' `field_tones` words onto the severity ramp this file
 * already measures contrast for. Unmapped (including the `neutral`
 * fallback) is `none` - the same grey an unrated severity gets, never nothing.
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
 *
 * **Two levels do not letter in their ramp colour.** The ramp is tuned to
 * carry `--on-severity` on top of it, and one step per ground fails as type
 * on the page: `low` measured **1.81:1** on light, `critical` **3.58:1** on
 * dark. Those two read `--severity-*-type`; the other four read the ramp,
 * because a token that can never disagree with its source is a copy that goes
 * stale unnoticed. -> `tokens.css`
 *
 * The fill map takes the same two values, so a marker dot matches the
 * lettering beside it rather than the rail behind it.
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
