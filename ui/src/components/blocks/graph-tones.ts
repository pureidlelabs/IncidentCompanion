import type { Specs } from '@/api/specs'

/**
 * A node's colour, from the tones the server publishes.
 *
 * **`_VERDICT_COLOUR` and `_DANGER_COLOURS` are deliberately not ported.**
 * Those two maps are a client-side classification
 * - they decide that "commodity infection" is the same colour as "suspicious"
 * - and one of them has already gone stale exactly that way: a vocabulary
 * rename left every compromised host quietly dropping to the unknown colour,
 * on a graph whose entire job is showing which hosts are bad. `GET /api/specs`
 * already publishes `field_tones`, so the client reads a decision it does not
 * make.
 *
 * **A value with no served tone is grey, never green.** Grey is the honest
 * answer: an account carries no verdict field at all, and painting it "clean"
 * states a conclusion nobody reached.
 */

export type Tone = 'bad' | 'warn' | 'good' | 'info' | 'none'

/**
 * A served severity to the tone the canvas paints it in.
 *
 * **Every value the server serves has an entry**, asserted against the served
 * vocabulary in `tones.test.ts`. Nothing on the canvas can be tested through
 * the drawing - `cytoscape()` throws under jsdom, so `paint()` never runs - so
 * the decision lives here where a unit test can hold it.
 *
 * `critical` and `high` share `bad`: the tone vocabulary has four rungs and the
 * severity vocabulary has five, and `bad` is already `--severity-critical`. The
 * chip tier distinguishes them and the canvas cannot.
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
 *
 * A colour in the DOM and the same colour in an SVG export are two decisions,
 * so nothing here is reachable from an export path: the SVG and PNG exports
 * stay Python's, against their own fixed ground.
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
 *
 * **The canvas has four rungs and the chips have eight**, so this collapses
 * rather than adds: a node is a dot in a drawing and the hue is all it can
 * carry, where a chip carries a word too. `contain` and `investigate` are the
 * two that have no canvas rung and take the nearest reading -- green is `good`
 * because nothing is wrong there, violet is `bad` because exfiltration is.
 *
 * A role with no entry is `none`, which is grey, which is the honest answer
 * for a value nobody classified.
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
