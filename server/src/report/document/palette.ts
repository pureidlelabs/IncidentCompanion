/**
 * The hex a document is painted in, and the ink that reads on it.
 *
 * **A colour on screen and the same colour in a document are two decisions.**
 * Contrast is a property of the ground, and a document has no theme to consult
 * - a report is printed, photocopied and pasted into Word, where a
 * `var(--app-sev-high)` resolves to nothing. So these are literals, and they
 * are deliberately not the theme's tokens.
 */

/**
 * The ramp the phase grid fills from.
 *
 * **Three rungs, where this server's severity scale has five.** Nothing in a
 * document is coloured by a row's own severity - `PHASE_SEVERITY` keys on the
 * ATT&CK tactic - so `critical` and `informational` need no hex here. Adding a
 * `chip` painter that reads a severity is what would make that false.
 */
export const LOW = '#eab308'
export const MEDIUM = '#f97316'
export const HIGH = '#ef4444'

export const INK = '#12151c'
export const MUTED = '#6b7280'
export const BAND = '#f1f3f6'
export const PAPER = '#ffffff'

/**
 * A table's header row: dark ground, white ink, named here so no painter keeps
 * its own copy. `a header row nobody can find` holds the contrast.
 */
export const TABLE_HEADER = '#1f2430'
export const TABLE_HEADER_INK = '#ffffff'

/**
 * The ground every other body row sits on.
 *
 * **Beside the header rather than in the painters, because the two are one
 * decision.** The stripe is what the header has to be findable *against*, and
 * while both hexes lived in both painters nothing could assert the pair - which
 * is how a header at 1.08:1 against it shipped in two documents at once.
 */
export const ZEBRA = '#f8f8f8'

/** A hairline: a divider, a table's horizontal rules, the kill chain's spine. */
export const RULE = '#cccccc'

/** What the app paints its own response in, off the severity ramp entirely. */
export const RESPONSE = '#0d7d8a'

/**
 * The one brand colour: section numbers, the rule under a heading, an ATT&CK id.
 *
 * **Carried rather than derived, and the same hex Python's default style uses**,
 * so the two backends' documents are one design rather than two that resemble
 * each other. 6.29:1 on paper, so it is safe as text and not only as a rule.
 */
export const ACCENT = '#4f46e5'

/**
 * The TLP marking's own colours, which are the standard's and not this app's.
 *
 * **Black ground, and the ink is FIRST.org's published hue** - a marking a
 * recipient half-recognises is worse than none, so these are not adjusted for
 * the palette and not swapped for a severity rung. `TLP:CLEAR` is white on
 * black, which is why the ground cannot be white.
 */
export const TLP_GROUND = '#000000'
export const TLP_INK: Record<string, string> = {
  'TLP:CLEAR': '#ffffff',
  'TLP:GREEN': '#33ff00',
  'TLP:AMBER': '#ffc000',
  'TLP:AMBER+STRICT': '#ffc000',
  'TLP:RED': '#ff2b2b',
}

/** The marking's ink, falling back to white for a marking this build has not met. */
export function tlpInk(marking: string): string {
  return TLP_INK[marking.toUpperCase()] ?? '#ffffff'
}

/**
 * The ground a severity chip is printed on, and it is the case's own scale.
 *
 * **Five rungs here where the phase ramp has three**, because a severity chip
 * prints what the analyst set: `critical` and `informational` are values a case
 * carries and a phase never is.
 */
export const SEVERITY_FILL: Record<string, string> = {
  critical: '#7f1d1d',
  high: '#fee2e2',
  medium: '#ffedd5',
  low: '#fef9c3',
  informational: '#e5e7eb',
}

/**
 * The ink each rung is printed in, carried rather than computed.
 *
 * **`inkOn` is a luminance rule and would answer black for four of these five.**
 * A chip reads as its rung because the *text* is the rung's hue on a pale ground
 * of the same hue; black on pink is legible and says nothing. Measured on paper:
 * 10.02, 6.80, 6.38, 6.38 and 8.33 to 1, against a 4.5 floor - the one number
 * this project has already shipped wrong is a chip at 2.59.
 */
export const SEVERITY_INK: Record<string, string> = {
  critical: '#ffffff',
  high: '#991b1b',
  medium: '#9a3412',
  low: '#854d0e',
  informational: '#374151',
}

/** A rung's chip colours, or the neutral one for a value no scale names. */
export function severityChip(value: string): { fill: string; ink: string } {
  const rung = value.trim().toLowerCase()
  return {
    fill: SEVERITY_FILL[rung] ?? SEVERITY_FILL['informational']!,
    ink: SEVERITY_INK[rung] ?? SEVERITY_INK['informational']!,
  }
}

/**
 * What a chip of a given kind is painted in.
 *
 * **One lookup both painters call**, so a chip kind added for the PDF cannot
 * arrive in Word as a severity it never was - which is what happens when each
 * painter maps the kind itself. A kind neither knows falls to the neutral pair
 * rather than to a rung: an unknown *kind* is not an unknown *severity*.
 */
export function chipColours(kind: string, value: string): { fill: string; ink: string } {
  if (kind === 'severity') return severityChip(value)
  // An identifier is not a judgement, so it gets the neutral band rather than
  // a colour a reader would try to interpret. 16.43:1.
  return { fill: BAND, ink: INK }
}

/**
 * The phases an intrusion proceeds through, in order.
 *
 * **Order is what makes a cell's position mean something** - a reader takes
 * "stopped before impact" from where the filled cells stop.
 */
export const PHASE_SEVERITY: Record<string, string> = {
  reconnaissance: LOW,
  'resource development': LOW,
  'initial access': LOW,
  execution: MEDIUM,
  persistence: MEDIUM,
  'privilege escalation': HIGH,
  'defense evasion': MEDIUM,
  'credential access': HIGH,
  discovery: MEDIUM,
  'lateral movement': HIGH,
  collection: MEDIUM,
  'command and control': HIGH,
  exfiltration: HIGH,
  impact: HIGH,
}

/** `#rrggbb` to its three channels, 0-255. */
function channels(hex: string): [number, number, number] {
  const at = hex.replace('#', '')
  return [
    Number.parseInt(at.slice(0, 2), 16),
    Number.parseInt(at.slice(2, 4), 16),
    Number.parseInt(at.slice(4, 6), 16),
  ]
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex)
  const linear = [r, g, b].map((channel) => {
    const part = channel / 255
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG contrast ratio, 1 to 21, order-independent. */
export function contrastRatio(one: string, other: string): number {
  const a = luminance(one)
  const b = luminance(other)
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Whichever of ink and white reads on this fill, computed rather than chosen:
 * the fill carries the severity and the type carries the legibility. White
 * fails on every rung of the ramp.
 */
export function inkOn(fill: string): string {
  return contrastRatio(PAPER, fill) > contrastRatio(INK, fill) ? PAPER : INK
}
