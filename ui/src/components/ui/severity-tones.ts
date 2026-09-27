/**
 * The severity ramp as classes, and the words that resolve onto it.
 *
 * A token per severity, never a literal. An SVG export has no theme to
 * consult, so nothing here is reused by one.
 */

/** The fill per severity, apart from the ink: a dot wants one and not both. */
export const SEVERITY_FILL = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
  none: 'bg-severity-none',
} as const

/**
 * The ink per severity.
 *
 * `low` is the one level light enough that the shared foreground fails on it -
 * measured 1.8:1 against it, 10.4:1 against this one - so it carries its own.
 */
export const SEVERITY_INK = {
  critical: 'text-on-severity',
  high: 'text-on-severity',
  medium: 'text-on-severity',
  low: 'text-on-severity-low',
  info: 'text-on-severity',
  none: 'text-on-severity',
} as const

export type SeverityTone = keyof typeof SEVERITY_FILL

/**
 * Fill and ink together, for a chip.
 *
 * Joined rather than written out, so the halves and the whole cannot disagree.
 *
 * An unknown severity renders as `none` rather than unstyled: severity is free
 * text on the wire and a value nobody anticipated must still read as a chip.
 */
export const TONE_CLASS = Object.fromEntries(
  (Object.keys(SEVERITY_FILL) as SeverityTone[]).map((tone) => [
    tone,
    `${SEVERITY_FILL[tone]} ${SEVERITY_INK[tone]}`,
  ]),
) as Record<SeverityTone, string>

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
 * **Takes the value defensively, though the type says `string`.** An activity
 * reaches here with no `severity` at all -- the key is absent on the wire --
 * and `undefined.trim()` takes the whole SPA to React Router's error boundary
 * ("Unexpected Application Error!"), not just the row.
 *
 * `none` is the documented answer for a value that is not a known tone, and a
 * missing value is one of those.
 */
export function toneFor(severity: string | null | undefined): SeverityTone {
  const key = (severity ?? '').trim().toLowerCase()
  return TONE_OF.get(key) ?? (Object.hasOwn(TONE_CLASS, key) ? (key as SeverityTone) : 'none')
}

/**
 * What a severity reads as, which for an empty one is a word rather than a
 * blank chip.
 *
 * Beside `toneFor` because the two answer the same question about the same
 * value.
 */
export function severityLabel(severity: string | null | undefined): string {
  return (severity ?? '').trim() || 'unset'
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

/** The tones as a custom property, for a surface painting its own stripe: a
 * gradient takes a colour value and a `bg-*` class is not one. */
export const TONE_STRIPE: Record<FieldTone, string> = {
  critical: '[--tone-stripe:var(--severity-critical-type)]',
  high: '[--tone-stripe:var(--severity-high)]',
  medium: '[--tone-stripe:var(--severity-medium)]',
  low: '[--tone-stripe:var(--severity-low-type)]',
  info: '[--tone-stripe:var(--severity-info)]',
  none: '[--tone-stripe:var(--severity-none)]',
  done: '[--tone-stripe:var(--action-contain)]',
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
