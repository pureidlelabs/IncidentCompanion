import type { Specs } from '@/api/specs'

/**
 * A node's colour, from the tones the server publishes.
 *
 * **No client-side classification, deliberately.** A map here deciding that
 * "commodity infection" is the same colour as "suspicious" goes stale the
 * first time the vocabulary is renamed -- and it goes stale silently, leaving
 * every compromised host dropping to the unknown colour on a graph whose whole
 * job is showing which hosts are bad. `GET /api/specs` publishes the tones, so
 * the client reads a decision it does not make.
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
